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
  StrategyType,
} from "./types"
import {
  UNDERLYING_ASSETS_QUERY,
  TRADE_QUERY,
  OTOKENS_QUERY,
  OTOKEN_QUERY,
  ACCOUNT_VAULTS_QUERY,
} from "./queries"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatUnits = (value: BN, decimals: number): BN =>
  value.shiftedBy(-decimals)

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

const calculateAPR = (
  premium: BN,
  notional: BN,
  expirationTimestamp: number,
): BN => {
  const daysToExpiry = Math.max(
    0,
    (expirationTimestamp - Math.floor(Date.now() / 1000)) / 86400,
  )
  if (daysToExpiry === 0) return new BN(0)
  return premium.div(notional).multipliedBy(365).div(daysToExpiry)
}

// ─── Price fetching ─────────────────────────────────────────────────────────

type PriceResponse = {
  result: Record<string, { price: number }>
}

type PremiumResult = Record<
  string,
  { bid: number }
>

const fetchAssetsPrices = async (
  symbols: string[],
): Promise<Record<string, number>> => {
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
  if (!res.ok) throw new Error(`Failed to fetch prices: ${res.status}`)
  const data: PriceResponse = await res.json()

  const result: Record<string, number> = {}
  for (const [aliased, priceData] of Object.entries(data.result)) {
    const originals = aliasedToOriginal.get(aliased) || [aliased]
    originals.forEach((sym) => { result[sym] = priceData.price })
  }
  return result
}

const fetchSeriesPremiums = async (
  series: Array<{ underlyingTokenSymbol: string; expiration: number; strikePrice: number; type: string }>,
): Promise<PremiumResult> => {
  if (series.length === 0) return {}

  const getSymbolForRequest = (s: typeof series[number]) =>
    getSeriesSymbol({
      ...s,
      underlyingTokenSymbol: PRICE_ALIAS_MAP[s.underlyingTokenSymbol] ?? s.underlyingTokenSymbol,
    })

  const symbols = [...new Set(series.map(getSymbolForRequest))]

  const res = await fetch(`${CHAIN_CONFIG.quoteProviderUrl}/optionsPrices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbols }),
  })
  if (!res.ok) throw new Error(`Failed to fetch premiums: ${res.status}`)
  const data: { result: PremiumResult } = await res.json()

  const result: PremiumResult = {}
  for (const s of series) {
    const originalKey = getSeriesSymbol(s)
    const requestKey = getSymbolForRequest(s)
    if (data.result[requestKey]) {
      result[originalKey] = data.result[requestKey]
    }
  }
  return result
}

// ─── Subgraph types ─────────────────────────────────────────────────────────

type SubgraphAsset = { id: string; symbol: string; decimals: number }

type SubgraphPool = {
  id: string
  strikeAsset: SubgraphAsset
  collateralAsset: SubgraphAsset
  underlyingAssets: Array<{
    asset: SubgraphAsset
    enabled: boolean
    strikeIncrement?: string
  }>
}

type SubgraphOToken = {
  id: string
  strikePrice: string
  expiryTimestamp: string
  isPut: boolean
  underlyingAsset: { id: string }
  collateralAsset: { id: string }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch available underlying assets with current prices.
 */
export async function fetchAssets(): Promise<UnderlyingAsset[]> {
  const data = await request<{ pools: SubgraphPool[] }>(
    CHAIN_CONFIG.subgraphUrl,
    UNDERLYING_ASSETS_QUERY,
  )
  const pool = data.pools[0]
  if (!pool) return []

  const enabledPoolAssets = (pool.underlyingAssets || []).filter(
    (ua) => ua.enabled && ENABLED_ASSETS.includes(ua.asset.symbol),
  )

  const stakedEntries = Object.keys(STAKED_TOKENS).filter((sym) =>
    ENABLED_ASSETS.includes(sym),
  )

  const allSymbols = [
    ...enabledPoolAssets.map((ua) => ua.asset.symbol),
    ...stakedEntries,
  ]
  const prices = await fetchAssetsPrices([...new Set(allSymbols)])

  const assets: UnderlyingAsset[] = []

  for (const ua of enabledPoolAssets) {
    assets.push({
      id: ua.asset.id,
      symbol: ua.asset.symbol,
      decimals: ua.asset.decimals,
      price: prices[ua.asset.symbol] || 0,
      collateralAsset: { id: pool.collateralAsset.id, symbol: pool.collateralAsset.symbol },
      strikeAsset: { symbol: pool.strikeAsset.symbol },
    })
  }

  for (const stakedSymbol of stakedEntries) {
    const baseSymbol = STAKED_TOKENS[stakedSymbol]
    const baseAsset = enabledPoolAssets.find((ua) => ua.asset.symbol === baseSymbol)
    if (!baseAsset) continue
    const tokenMeta = TOKENS[stakedSymbol]
    if (!tokenMeta) continue

    assets.push({
      id: tokenMeta.address,
      symbol: stakedSymbol,
      decimals: tokenMeta.decimals,
      price: prices[stakedSymbol] || prices[baseSymbol] || 0,
      collateralAsset: { id: pool.collateralAsset.id, symbol: pool.collateralAsset.symbol },
      strikeAsset: { symbol: pool.strikeAsset.symbol },
    })
  }

  return assets.sort((a, b) => a.symbol.localeCompare(b.symbol))
}

/**
 * Fetch available options series for a given asset and strategy.
 */
export async function fetchSeries(
  asset: UnderlyingAsset,
  strategyType: StrategyType = "CoveredCall",
): Promise<Series[]> {
  const isCashSecuredPut = strategyType === "CashSecuredPut"

  const poolData = await request<{ pools: SubgraphPool[] }>(
    CHAIN_CONFIG.subgraphUrl,
    TRADE_QUERY,
  )
  const pool = poolData.pools[0]
  if (!pool) return []

  // For staked assets, query by the base underlying contract address
  const baseSymbol = STAKED_TOKENS[asset.symbol]
  const contractSymbol = baseSymbol ? PROTOCOL_TO_CONTRACT_SYMBOL[baseSymbol] : null
  const contractToken = contractSymbol ? TOKENS[contractSymbol] : null
  const underlyingAssetId = contractToken ? contractToken.address : asset.id

  const collateralAssetId = isCashSecuredPut ? asset.collateralAsset.id : asset.id

  const strikePriceThreshold = parseUnits(new BN(asset.price), STRIKE_PRICE_DECIMALS)
    .decimalPlaces(0, BN.ROUND_FLOOR)

  const oTokensData = await request<{ otokens: SubgraphOToken[] }>(
    CHAIN_CONFIG.subgraphUrl,
    OTOKENS_QUERY,
    {
      underlyingAsset: underlyingAssetId,
      collateralAsset: collateralAssetId,
      isPut: isCashSecuredPut,
      expiryTimestamp: dayjs().unix().toString(),
      strikePriceGt: isCashSecuredPut ? "0" : strikePriceThreshold.toFixed(0),
      strikePriceLt: isCashSecuredPut
        ? strikePriceThreshold.toFixed(0)
        : strikePriceThreshold.multipliedBy(2).toFixed(0),
      orderDirection: isCashSecuredPut ? "desc" : "asc",
    },
  )

  const oTokens = oTokensData.otokens || []

  // Find matching pool underlying
  const poolUnderlying =
    pool.underlyingAssets.find((ua) => ua.asset.symbol === asset.symbol) ||
    (baseSymbol
      ? pool.underlyingAssets.find(
          (ua) => ua.asset.symbol === baseSymbol || ua.asset.symbol === (PROTOCOL_TO_CONTRACT_SYMBOL[baseSymbol] || baseSymbol),
        )
      : null)
  if (!poolUnderlying) return []

  // Filter oTokens
  const stakedCollateralAddresses = Object.keys(STAKED_TOKENS)
    .map((sym) => TOKENS[sym]?.address?.toLowerCase())
    .filter(Boolean)

  const strikeIncrementRaw = poolUnderlying.strikeIncrement
    ? new BN(poolUnderlying.strikeIncrement)
    : null

  const filteredOTokens = oTokens.filter((oToken) => {
    if (oToken.underlyingAsset.id !== underlyingAssetId) return false

    // For non-staked tokens, exclude oTokens with staked collateral
    if (!(asset.symbol in STAKED_TOKENS) && stakedCollateralAddresses.length > 0) {
      if (stakedCollateralAddresses.includes(oToken.collateralAsset.id.toLowerCase())) return false
    }

    // Filter non-standard strike increments
    if (strikeIncrementRaw?.gt(0)) {
      if (!new BN(oToken.strikePrice).modulo(strikeIncrementRaw).eq(0)) return false
    }

    return true
  })

  // Build series data
  const seriesBase = filteredOTokens.map((oToken) => ({
    underlyingTokenSymbol: poolUnderlying.asset.symbol,
    type: oToken.isPut ? ("Put" as const) : ("Call" as const),
    expiration: Number(oToken.expiryTimestamp),
    strikePrice: formatUnits(new BN(oToken.strikePrice), STRIKE_PRICE_DECIMALS).toNumber(),
    poolAddress: pool.id,
    collateralTokenAddress: pool.collateralAsset.id,
    collateralTokenSymbol: pool.collateralAsset.symbol,
    collateralTokenDecimals: pool.collateralAsset.decimals,
    strikeTokenSymbol: pool.strikeAsset.symbol,
  }))

  // Fetch premiums
  const premiums = await fetchSeriesPremiums(seriesBase)

  // Combine and calculate APR
  const price = new BN(asset.price)
  const series: Series[] = seriesBase.map((s) => {
    const seriesSymbol = getSeriesSymbol(s)
    const pricing = premiums[seriesSymbol]
    const bid = pricing ? new BN(pricing.bid) : new BN(0)
    const upfrontRewardUSD = bid.abs()

    let collateralRewardAPR = new BN(0)
    if (price.gt(0) && upfrontRewardUSD.gt(0)) {
      collateralRewardAPR = calculateAPR(upfrontRewardUSD, price, s.expiration)
    }

    return {
      ...s,
      id: seriesSymbol,
      side: "Sell" as const,
      collateralRewardAPR,
    }
  })

  return series
    .filter((s) => {
      const pricing = premiums[s.id]
      return pricing && new BN(pricing.bid).gt(0)
    })
    .sort((a, b) =>
      strategyType === "CashSecuredPut"
        ? b.strikePrice - a.strikePrice
        : a.strikePrice - b.strikePrice,
    )
}

/**
 * Fetch a signed quote from the Hypersurface market maker.
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

  const res = await fetch(`${CHAIN_CONFIG.quoteProviderUrl}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sign, order: adjustedOrder }),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => null)
    throw new Error(errorData?.error?.message || `Quote API returned ${res.status}`)
  }

  const data: { result: { order: IOrderUtil.OrderStruct } } = await res.json()
  return data.result.order
}

/**
 * Execute a trade on-chain via the HedgedPool contract.
 */
export async function executeTrade(
  signer: ethers.Signer,
  signedOrder: IOrderUtil.OrderStruct,
): Promise<string> {
  const poolContract = HedgedPool__factory.connect(
    signedOrder.poolAddress.toString(),
    signer,
  )

  // Always create a new vault — vault reuse requires more subgraph logic
  const tx = await poolContract.trade(signedOrder, "0", true, {
    gasLimit: 1500000,
  })
  const receipt = await tx.wait(1)
  return receipt.transactionHash
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

  return { isSpendAllowed: currentAllowance.gte(requiredAmount) }
}

/**
 * Approve a token for spending by a contract.
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
  return tx.wait()
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
  const tradeExecutor = await addressBook.getTradeExecutor()
  return { tradeExecutor }
}
