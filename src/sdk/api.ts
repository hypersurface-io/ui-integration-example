/**
 * Hypersurface SDK — Pure Async API Functions
 *
 * Framework-agnostic functions for interacting with the Hypersurface protocol.
 * These can be used directly in any JavaScript/TypeScript project.
 * React hook wrappers are provided separately in hooks.ts.
 */

import { BigNumber as BN } from "bignumber.js"
import { ethers } from "ethers"
import dayjs from "dayjs"
import { request } from "graphql-request"
import {
  HedgedPool__factory,
  SimpleToken__factory,
  AddressBook__factory,
} from "@eng-hypersurface/contracts"
import type { IOrderUtil } from "@eng-hypersurface/contracts"

import {
  CHAIN_CONFIG,
  TOKENS,
  ENABLED_ASSETS,
  PROTOCOL_TO_CONTRACT_SYMBOL,
  PRICE_ALIAS_MAP,
  STAKED_TOKENS,
  STRIKE_PRICE_DECIMALS,
} from "./config"
import type {
  UnderlyingAsset,
  Series,
  SeriesPosition,
  SeriesOrderData,
  AllowanceResult,
  ProtocolAddresses,
  TradeResult,
  StrategyType,
} from "./types"
import {
  TRADE_QUERY,
  UNDERLYING_ASSETS_QUERY,
  OTOKENS_QUERY,
  OTOKEN_QUERY,
  ACCOUNT_VAULTS_QUERY,
} from "./queries"

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a raw BigNumber value from contract decimals to a human number */
const formatUnits = (value: BN, decimals: number): BN =>
  value.shiftedBy(-decimals)

/** Parse a human number to raw BigNumber with contract decimals */
const parseUnits = (value: BN, decimals: number): BN =>
  value.shiftedBy(decimals)

/** Build series symbol string (e.g., "ETH-04APR26-2500-C") */
const getSeriesSymbol = (s: {
  underlyingTokenSymbol: string
  expiration: number
  strikePrice: number
  type: string
}) =>
  `${s.underlyingTokenSymbol}-${dayjs
    .unix(s.expiration)
    .format("DDMMMYY")
    .toUpperCase()}-${s.strikePrice}-${s.type[0]}`

/** Calculate APR from premium, notional, and expiration */
const calculateAPR = (
  premium: BN,
  notional: BN,
  expirationTimestamp: number,
): BN => {
  const startTime = Math.floor(Date.now() / 1000)
  const daysToExpiry = Math.max(
    0,
    (expirationTimestamp - startTime) / 86400,
  )
  if (daysToExpiry === 0) return new BN(0)
  return premium.div(notional).multipliedBy(365).div(daysToExpiry)
}

// ─── Price fetching ────────────────────────────────────────────────────��──────

type AssetPriceResponse = {
  result: Record<string, { price: number; timestamp: number }>
}

type SeriesPremiumResult = Record<
  string,
  {
    premium: number
    bid: number
    ask: number
    probability_otm: number
    greeks?: {
      iv: number
      r: number
      delta: number
      gamma: number
      theta: number
      vega: number
    }
  }
>

/** Fetch prices for multiple asset symbols from the quote API */
const fetchAssetsPrices = async (
  symbols: string[],
): Promise<Record<string, number>> => {
  // Map symbols using price alias (e.g., kHYPE → HYPE)
  const aliasedToOriginal = new Map<string, string[]>()
  const requestSymbols: string[] = []

  symbols.forEach((symbol) => {
    const aliased = PRICE_ALIAS_MAP[symbol] || symbol
    if (!requestSymbols.includes(aliased)) {
      requestSymbols.push(aliased)
    }
    const originals = aliasedToOriginal.get(aliased) || []
    originals.push(symbol)
    aliasedToOriginal.set(aliased, originals)
  })

  const params = requestSymbols.map((s) => `symbol=${s}`).join("&")
  const res = await fetch(
    `${CHAIN_CONFIG.quoteProviderUrl}/underlyingPrices?${params}`,
  )
  if (!res.ok) {
    throw new Error(`Failed to fetch asset prices: ${res.status} ${res.statusText}`)
  }
  const data: AssetPriceResponse = await res.json()

  const result: Record<string, number> = {}
  for (const [aliased, priceData] of Object.entries(data.result)) {
    const originals = aliasedToOriginal.get(aliased) || [aliased]
    originals.forEach((sym) => {
      result[sym] = priceData.price
    })
  }
  return result
}

/** Fetch premiums for a list of series from the quote API */
const fetchSeriesPremiums = async (
  series: Array<{ underlyingTokenSymbol: string; expiration: number; strikePrice: number; type: string }>,
): Promise<SeriesPremiumResult> => {
  if (series.length === 0) return {}

  const getSymbolForRequest = (s: typeof series[number]) =>
    getSeriesSymbol({
      ...s,
      underlyingTokenSymbol:
        PRICE_ALIAS_MAP[s.underlyingTokenSymbol] ?? s.underlyingTokenSymbol,
    })

  const symbols = [...new Set(series.map(getSymbolForRequest))]

  const res = await fetch(
    `${CHAIN_CONFIG.quoteProviderUrl}/optionsPrices`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols, greeks: true }),
    },
  )
  if (!res.ok) {
    throw new Error(`Failed to fetch premiums: ${res.status} ${res.statusText}`)
  }
  const data: { result: SeriesPremiumResult } = await res.json()

  // Remap response so callers look up by original series symbol
  const result: SeriesPremiumResult = {}
  for (const s of series) {
    const originalKey = getSeriesSymbol(s)
    const requestKey = getSymbolForRequest(s)
    if (data.result[requestKey]) {
      result[originalKey] = data.result[requestKey]
    }
  }
  return result
}

// ─── Subgraph response types ────────────────────────────────────────────���────

type SubgraphAsset = {
  id: string
  symbol: string
  name: string
  decimals: number
}

type SubgraphPool = {
  id: string
  tokenSymbol: string
  strikeAsset: SubgraphAsset
  collateralAsset: SubgraphAsset
  underlyingAssets: Array<{
    id?: string
    asset: SubgraphAsset
    enabled: boolean
    strikeMinPercent?: string
    strikeMaxPercent?: string
    strikeIncrement?: string
    expirationMonths?: string
    expirationQuarters?: string
    dailyAllowed?: boolean
  }>
}

type SubgraphOToken = {
  id: string
  strikePrice: string
  decimals: number
  expiryTimestamp: string
  isPut: boolean
  underlyingAsset: SubgraphAsset
  collateralAsset: SubgraphAsset
  strikeAsset: SubgraphAsset
}

// ─── Public API Functions ────────────────────────────────────────────────────

/**
 * Fetch available underlying assets with current prices.
 *
 * Queries the subgraph for pool data and fetches live prices from the quote API.
 * Returns only assets that are enabled in ENABLED_ASSETS config.
 */
export async function fetchAssets(): Promise<UnderlyingAsset[]> {
  const data = await request<{ pools: SubgraphPool[] }>(
    CHAIN_CONFIG.subgraphUrl,
    UNDERLYING_ASSETS_QUERY,
  )

  const pool = data.pools[0]
  if (!pool) return []

  // Filter to enabled assets
  const enabledPoolAssets = (pool.underlyingAssets || []).filter(
    (ua) => ua.enabled && ENABLED_ASSETS.includes(ua.asset.symbol),
  )

  // Also add staked token entries (e.g., kHYPE) — these share the base underlying
  // but have their own collateral token
  const stakedEntries = Object.keys(STAKED_TOKENS).filter((sym) =>
    ENABLED_ASSETS.includes(sym),
  )

  // Fetch prices for all symbols
  const allSymbols = [
    ...enabledPoolAssets.map((ua) => ua.asset.symbol),
    ...stakedEntries,
  ]
  const prices = await fetchAssetsPrices([...new Set(allSymbols)])

  const assets: UnderlyingAsset[] = []

  for (const ua of enabledPoolAssets) {
    const symbol = ua.asset.symbol
    // Skip if this symbol is a base of a staked token AND the staked version is separately enabled
    // (staked tokens are added below with their own entry)
    const price = prices[symbol] || 0
    const strikeIncrement = ua.strikeIncrement
      ? new BN(ua.strikeIncrement).shiftedBy(-STRIKE_PRICE_DECIMALS).toNumber()
      : 0

    assets.push({
      id: ua.asset.id,
      symbol: ua.asset.symbol,
      name: ua.asset.name,
      decimals: ua.asset.decimals,
      price,
      poolAddress: pool.id,
      chainId: CHAIN_CONFIG.chainId,
      chainName: CHAIN_CONFIG.chainName,
      chainSymbol: "HYPE",
      enabled: true,
      strikeMinPercent: Number(ua.strikeMinPercent) || 50,
      strikeMaxPercent: Number(ua.strikeMaxPercent) || 150,
      strikeIncrement,
      expirationMonths: Number(ua.expirationMonths) || 3,
      expirationQuarters: Number(ua.expirationQuarters) || 2,
      dailyAllowed: ua.dailyAllowed || false,
      collateralAsset: {
        id: pool.collateralAsset.id,
        symbol: pool.collateralAsset.symbol,
        name: pool.collateralAsset.name,
        decimals: pool.collateralAsset.decimals,
      },
      strikeAsset: {
        id: pool.strikeAsset.id,
        symbol: pool.strikeAsset.symbol,
        name: pool.strikeAsset.name,
        decimals: pool.strikeAsset.decimals,
      },
    })
  }

  // Add staked token entries
  for (const stakedSymbol of stakedEntries) {
    const baseSymbol = STAKED_TOKENS[stakedSymbol]
    const baseAsset = enabledPoolAssets.find((ua) => ua.asset.symbol === baseSymbol)
    if (!baseAsset) continue

    const tokenMeta = TOKENS[stakedSymbol]
    if (!tokenMeta) continue

    const price = prices[stakedSymbol] || prices[baseSymbol] || 0
    const strikeIncrement = baseAsset.strikeIncrement
      ? new BN(baseAsset.strikeIncrement).shiftedBy(-STRIKE_PRICE_DECIMALS).toNumber()
      : 0

    assets.push({
      id: tokenMeta.address,
      symbol: stakedSymbol,
      name: tokenMeta.name,
      decimals: tokenMeta.decimals,
      price,
      poolAddress: pool.id,
      chainId: CHAIN_CONFIG.chainId,
      chainName: CHAIN_CONFIG.chainName,
      chainSymbol: "HYPE",
      enabled: true,
      strikeMinPercent: Number(baseAsset.strikeMinPercent) || 50,
      strikeMaxPercent: Number(baseAsset.strikeMaxPercent) || 150,
      strikeIncrement,
      expirationMonths: Number(baseAsset.expirationMonths) || 3,
      expirationQuarters: Number(baseAsset.expirationQuarters) || 2,
      dailyAllowed: baseAsset.dailyAllowed || false,
      collateralAsset: {
        id: pool.collateralAsset.id,
        symbol: pool.collateralAsset.symbol,
        name: pool.collateralAsset.name,
        decimals: pool.collateralAsset.decimals,
      },
      strikeAsset: {
        id: pool.strikeAsset.id,
        symbol: pool.strikeAsset.symbol,
        name: pool.strikeAsset.name,
        decimals: pool.strikeAsset.decimals,
      },
    })
  }

  return assets.sort((a, b) => a.symbol.localeCompare(b.symbol))
}

/**
 * Fetch available options series for a given asset and strategy.
 *
 * Queries the subgraph for pool data and oTokens, then fetches premiums
 * from the quote API. Returns series sorted by strike price with APR calculated.
 */
export async function fetchSeries(
  asset: UnderlyingAsset,
  strategyType: StrategyType = "CoveredCall",
): Promise<Series[]> {
  const isCashSecuredPut = strategyType === "CashSecuredPut"

  // Fetch pool data
  const poolData = await request<{ pools: SubgraphPool[] }>(
    CHAIN_CONFIG.subgraphUrl,
    TRADE_QUERY,
  )
  const pool = poolData.pools[0]
  if (!pool) return []

  // For staked assets, query by the base underlying contract address
  const baseSymbol = STAKED_TOKENS[asset.symbol]
  const contractSymbol = baseSymbol
    ? PROTOCOL_TO_CONTRACT_SYMBOL[baseSymbol]
    : null
  const contractToken = contractSymbol ? TOKENS[contractSymbol] : null
  const underlyingAssetIdForQuery = contractToken
    ? contractToken.address
    : asset.id

  // Collateral: for covered calls, collateral is the underlying; for CSP, it's the pool collateral
  const collateralAssetId = isCashSecuredPut
    ? asset.collateralAsset.id
    : asset.id

  const currentUnixTime = dayjs().unix().toString()
  const strikePriceThreshold = parseUnits(
    new BN(asset.price),
    STRIKE_PRICE_DECIMALS,
  )
    .decimalPlaces(0, BN.ROUND_FLOOR)

  const strikePriceGt = isCashSecuredPut
    ? "0"
    : strikePriceThreshold.toFixed(0)
  const strikePriceLt = isCashSecuredPut
    ? strikePriceThreshold.toFixed(0)
    : strikePriceThreshold.multipliedBy(2).toFixed(0)

  // Fetch oTokens from subgraph
  const oTokensData = await request<{ otokens: SubgraphOToken[] }>(
    CHAIN_CONFIG.subgraphUrl,
    OTOKENS_QUERY,
    {
      underlyingAsset: underlyingAssetIdForQuery,
      collateralAsset: collateralAssetId,
      isPut: isCashSecuredPut,
      expiryTimestamp: currentUnixTime,
      strikePriceGt,
      strikePriceLt,
      orderDirection: isCashSecuredPut ? "desc" : "asc",
    },
  )

  const oTokens = oTokensData.otokens || []

  // Find matching pool underlying asset
  const poolUnderlying = pool.underlyingAssets.find(
    (ua) => ua.asset.symbol === asset.symbol,
  )
  // For staked tokens, fall back to the base underlying
  const poolUnderlyingForStaked = baseSymbol
    ? pool.underlyingAssets.find(
        (ua) =>
          ua.asset.symbol === baseSymbol ||
          ua.asset.symbol === (PROTOCOL_TO_CONTRACT_SYMBOL[baseSymbol] || baseSymbol),
      )
    : null
  const effectivePoolUnderlying = poolUnderlying || poolUnderlyingForStaked
  if (!effectivePoolUnderlying) return []

  // Filter oTokens
  const stakedTokenCollateralAddresses = Object.keys(STAKED_TOKENS)
    .map((sym) => TOKENS[sym]?.address?.toLowerCase())
    .filter(Boolean)

  const strikeIncrementRaw = effectivePoolUnderlying.strikeIncrement
    ? new BN(effectivePoolUnderlying.strikeIncrement)
    : null

  const filteredOTokens = oTokens.filter((oToken) => {
    if (oToken.underlyingAsset.id !== underlyingAssetIdForQuery) return false

    // For non-staked tokens, exclude oTokens with staked collateral
    const isStakedToken = asset.symbol in STAKED_TOKENS
    if (!isStakedToken && stakedTokenCollateralAddresses.length > 0) {
      if (stakedTokenCollateralAddresses.includes(oToken.collateralAsset.id.toLowerCase())) {
        return false
      }
    }

    // Filter non-standard strike increments
    if (strikeIncrementRaw && strikeIncrementRaw.gt(0)) {
      const rawStrike = new BN(oToken.strikePrice)
      if (!rawStrike.modulo(strikeIncrementRaw).eq(0)) return false
    }

    return true
  })

  // Build series data without premiums
  const underlyingPrice = new BN(asset.price)
  const seriesDataWithoutPremiums = filteredOTokens.map((oToken) => ({
    poolAddress: pool.id,
    underlyingTokenAddress: effectivePoolUnderlying.asset.id,
    underlyingTokenSymbol: effectivePoolUnderlying.asset.symbol,
    underlyingTokenName: effectivePoolUnderlying.asset.name,
    underlyingTokenDecimals: effectivePoolUnderlying.asset.decimals,
    collateralTokenAddress: pool.collateralAsset.id,
    collateralTokenSymbol: pool.collateralAsset.symbol,
    collateralTokenName: pool.collateralAsset.name,
    collateralTokenDecimals: pool.collateralAsset.decimals,
    strikeTokenAddress: pool.strikeAsset.id,
    strikeTokenSymbol: pool.strikeAsset.symbol,
    strikeTokenName: pool.strikeAsset.name,
    strikeTokenDecimals: pool.strikeAsset.decimals,
    pair: `${effectivePoolUnderlying.asset.symbol} / ${pool.strikeAsset.symbol}`,
    type: oToken.isPut ? ("Put" as const) : ("Call" as const),
    side: "Sell" as const,
    expiration: Number(oToken.expiryTimestamp),
    strikePrice: formatUnits(new BN(oToken.strikePrice), STRIKE_PRICE_DECIMALS).toNumber(),
    underlyingAssetPrice: underlyingPrice.toNumber(),
  }))

  // Fetch premiums for all series
  const premiums = await fetchSeriesPremiums(seriesDataWithoutPremiums)

  // Combine series data with premiums
  const series: Series[] = seriesDataWithoutPremiums.map((s) => {
    const seriesSymbol = getSeriesSymbol(s)
    const pricing = premiums[seriesSymbol]

    const bid = pricing ? new BN(pricing.bid) : new BN(0)
    const price = new BN(asset.price)
    const notional = new BN(1).multipliedBy(price)
    const feePercent = new BN(0)
    const totalFeeUSD = bid.multipliedBy(feePercent)
    const upfrontRewardUSD = bid.abs().minus(totalFeeUSD)

    let collateralRewardAPR = new BN(0)
    if (notional.gt(0) && upfrontRewardUSD.gt(0)) {
      collateralRewardAPR = calculateAPR(
        upfrontRewardUSD,
        notional,
        s.expiration,
      )
    }

    return {
      ...s,
      id: seriesSymbol,
      premium: pricing ? new BN(pricing.premium).toNumber() : 0,
      bid: pricing ? new BN(pricing.bid).toNumber() : 0,
      ask: pricing ? new BN(pricing.ask).toNumber() : 0,
      greeks: {
        delta: Number(pricing?.greeks?.delta) || 0,
        gamma: Number(pricing?.greeks?.gamma) || 0,
        vega: Number(pricing?.greeks?.vega) || 0,
        theta: Number(pricing?.greeks?.theta) || 0,
        riskFreeRate: Number(pricing?.greeks?.r) || 0,
        impliedVolatility: Number(pricing?.greeks?.iv) || 0,
      },
      probabilityOTM: 1 - Number(pricing?.probability_otm || 0),
      collateralRewardAPR,
    }
  })

  // Sort and filter
  return series
    .sort((a, b) =>
      strategyType === "CashSecuredPut"
        ? b.strikePrice - a.strikePrice
        : a.strikePrice - b.strikePrice,
    )
    .filter((s) => s.bid > 0)
}

/**
 * Fetch a signed quote from the Hypersurface market maker.
 *
 * @param orderData - The order parameters (account, pool, underlying, collateral, legs)
 * @param sign - Whether to request a signed quote (true for trade execution)
 */
export async function fetchQuote(
  orderData: SeriesOrderData,
  sign: boolean,
  asset?: UnderlyingAsset,
): Promise<IOrderUtil.OrderStruct> {
  // For staked assets, replace the underlying address with the base contract address
  let adjustedOrder = orderData
  if (asset) {
    const baseSymbol = STAKED_TOKENS[asset.symbol]
    if (baseSymbol) {
      const contractSymbol = PROTOCOL_TO_CONTRACT_SYMBOL[baseSymbol]
      const contractToken = contractSymbol ? TOKENS[contractSymbol] : null
      if (contractToken) {
        adjustedOrder = { ...orderData, underlying: contractToken.address }
      }
    }
  }

  const requestBody = { sign, order: adjustedOrder }
  console.log("Quote API request:", JSON.stringify(requestBody, null, 2))

  const res = await fetch(`${CHAIN_CONFIG.quoteProviderUrl}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => null)
    const message = errorData?.error?.message || `Quote API returned ${res.status}`
    throw new Error(message)
  }

  const data: { result: { order: IOrderUtil.OrderStruct } } = await res.json()
  console.log("Quote API response:", JSON.stringify(data, null, 2))
  return data.result.order
}

/**
 * Execute a trade on-chain via the HedgedPool contract.
 *
 * Signs and submits the trade transaction using the provided signer.
 * Returns the transaction hash and trade details.
 */
export async function executeTrade(
  signer: ethers.Signer,
  signedOrder: IOrderUtil.OrderStruct,
  vaultId: string = "0",
): Promise<TradeResult & { txHash: string }> {
  const poolContract = HedgedPool__factory.connect(
    signedOrder.poolAddress.toString(),
    signer,
  )

  // TODO: temporarily force new vault creation to debug vault lookup issue
  const isNewVault = true
  const effectiveVaultId = "0"
  console.log("Trade params:", { signedOrder, vaultId: effectiveVaultId, isNewVault })
  console.log("Trade order JSON:", JSON.stringify(signedOrder, null, 2))
  const tx = await poolContract.trade(signedOrder, effectiveVaultId, isNewVault, {
    gasLimit: 1500000,
  })
  const receipt = await tx.wait(1)

  // Extract trade details from the order
  const leg = signedOrder.legs[0]
  return {
    txHash: receipt.transactionHash,
    underlyingTokenSymbol: "", // Caller should set from their context
    strikePrice: 0,
    expiration: 0,
    type: leg?.isPut ? "Put" : "Call",
    side: "Sell",
  }
}

/**
 * Check the current token allowance for a spender.
 */
export async function checkAllowance(
  provider: ethers.providers.Provider,
  tokenAddress: string,
  spenderAddress: string,
  userAddress: string,
  requiredAmount: BN,
): Promise<AllowanceResult> {
  const token = SimpleToken__factory.connect(tokenAddress, provider)
  const currentAllowance = await token
    .allowance(userAddress, spenderAddress)
    .then((amount) => new BN(amount.toString()))

  return {
    currentSpendAllowance: currentAllowance,
    requiredSpendAllowance: requiredAmount,
    isSpendAllowed: currentAllowance.gte(requiredAmount),
  }
}

/**
 * Approve a token for spending by a contract.
 *
 * @returns The transaction receipt
 */
export async function approveToken(
  signer: ethers.Signer,
  tokenAddress: string,
  spenderAddress: string,
  amount: BN,
): Promise<ethers.ContractReceipt> {
  const tokenContract = SimpleToken__factory.connect(tokenAddress, signer)
  const tx = await tokenContract.approve(spenderAddress, amount.toFixed(), {
    gasLimit: 100000,
  })

  const timeoutMs = 60_000
  const receipt = await Promise.race([
    tx.wait(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Approval transaction not mined within ${timeoutMs / 1000}s. TX: ${tx.hash}`,
            ),
          ),
        timeoutMs,
      ),
    ),
  ])

  return receipt
}

/**
 * Find the user's existing vault for a given series, or return "0" for a new vault.
 *
 * Queries the subgraph for the oToken matching the series parameters,
 * then checks if the user has a vault containing that oToken.
 */
export async function fetchVaultForSeries(
  userAddress: string,
  series: SeriesPosition,
  asset: UnderlyingAsset,
): Promise<string> {
  // For staked assets, use the base underlying address
  const baseSymbol = STAKED_TOKENS[asset.symbol]
  let underlyingAddress = asset.id
  if (baseSymbol) {
    const contractSymbol = PROTOCOL_TO_CONTRACT_SYMBOL[baseSymbol]
    const contractToken = contractSymbol ? TOKENS[contractSymbol] : null
    if (contractToken) underlyingAddress = contractToken.address
  }

  const collateralAddress = series.type === "Put"
    ? asset.collateralAsset.id
    : asset.id

  const strikePrice = new BN(series.strikePrice)
    .shiftedBy(STRIKE_PRICE_DECIMALS)
    .toFixed(0)

  // Find the oToken
  const oTokenResult = await request<{
    otokens: Array<{ id: string }>
  }>(CHAIN_CONFIG.subgraphUrl, OTOKEN_QUERY, {
    underlyingAsset: underlyingAddress.toLowerCase(),
    collateralAsset: collateralAddress.toLowerCase(),
    strikePrice,
    isPut: series.type === "Put",
    expiryTimestamp: String(series.expiration),
  })

  const oTokenId = oTokenResult.otokens[0]?.id
  if (!oTokenId) return "0"

  // Find user's vault with this oToken
  const vaultsResult = await request<{
    account: {
      id: string
      vaults: Array<{
        id: string
        vaultId: string
        otokens: Array<{ token: { id: string } }>
      }>
    } | null
  }>(CHAIN_CONFIG.subgraphUrl, ACCOUNT_VAULTS_QUERY, {
    owner: userAddress.toLowerCase(),
  })

  const vaults = vaultsResult.account?.vaults ?? []
  const oTokenIdLower = oTokenId.toLowerCase()
  const matchingVault = vaults.find(
    (v) => v.otokens[0]?.token?.id?.toLowerCase() === oTokenIdLower,
  )

  return matchingVault?.vaultId ?? "0"
}

/**
 * Fetch protocol contract addresses from the AddressBook.
 */
export async function fetchAddresses(
  provider: ethers.providers.Provider,
): Promise<ProtocolAddresses> {
  const addressBook = AddressBook__factory.connect(
    CHAIN_CONFIG.addressBookAddress,
    provider,
  )

  const [controller, tradeExecutor, marginCalculator] = await Promise.all([
    addressBook.getController(),
    addressBook.getTradeExecutor(),
    addressBook.getMarginCalculator(),
  ])

  return { controller, tradeExecutor, marginCalculator }
}
