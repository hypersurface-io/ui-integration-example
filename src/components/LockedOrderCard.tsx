import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BigNumber as BN } from "bignumber.js"
import dayjs from "dayjs"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { useAccount } from "wagmi"

import {
  useAssets,
  useSeries,
  useAllowance,
  useAddresses,
  fetchQuote,
  executeTrade,
  approveToken,
  PROTOCOL_TO_CONTRACT_SYMBOL,
} from "../sdk"
import type { UnderlyingAsset, Series, StrategyType } from "../sdk"
import { useEthersSigner, useEthersProvider } from "../App"
import { OutcomeCard } from "./OutcomeCard"
import { LockedOrderSuccess } from "./LockedOrderSuccess"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatPrice = (n: number): string => {
  if (n < 0.01) return n.toFixed(6)
  if (n < 1) return n.toFixed(4)
  if (n < 10) return n.toFixed(3)
  if (n < 100) return n.toFixed(2)
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

const formatPercent = (n: number): string =>
  `${(n * 100).toFixed(1)}%`

// ─── Component ────────────────────────────────────────────────────────────────

export const LockedOrderCard: React.FC = () => {
  const { address } = useAccount()
  const signer = useEthersSigner()
  const provider = useEthersProvider()

  // State
  const [strategyType, setStrategyType] = useState<StrategyType>("CashSecuredPut")
  const [selectedAsset, setSelectedAsset] = useState<UnderlyingAsset | undefined>()
  const [selectedExpiry, setSelectedExpiry] = useState<number | undefined>()
  const [selectedStrike, setSelectedStrike] = useState<number | undefined>()
  const [amount, setAmount] = useState("1")
  const [tradeState, setTradeState] = useState<
    "idle" | "quoting" | "approving" | "confirming" | "success" | "error"
  >("idle")
  const [tradeError, setTradeError] = useState<string>("")
  const [tradeTxHash, setTradeTxHash] = useState("")

  const isSellDirection = strategyType === "CoveredCall"

  // Fetch assets
  const { data: assets, loading: assetsLoading } = useAssets({ refetchInterval: 20_000 })

  // Auto-select first asset
  useEffect(() => {
    if (assets && assets.length > 0 && !selectedAsset) {
      setSelectedAsset(assets[0])
    }
  }, [assets, selectedAsset])

  // Fetch series for selected asset
  const { data: seriesList, loading: seriesLoading } = useSeries(
    selectedAsset,
    strategyType,
    { refetchInterval: 15_000 },
  )

  // Compute all available expirations
  const availableExpirations = useMemo(() => {
    if (!seriesList || seriesList.length === 0) return []
    return [...new Set(seriesList.map((s) => s.expiration))]
      .sort()
  }, [seriesList])

  // Default expiry: closest Friday at least 5 days out, falling back to first expiry >= 5 days, then first available
  const defaultExpiry = useMemo(() => {
    if (availableExpirations.length === 0) return undefined
    const now = Math.floor(Date.now() / 1000)
    const minSecondsOut = 5 * 24 * 60 * 60
    const atLeastFiveDays = availableExpirations.filter((exp) => exp - now >= minSecondsOut)
    const fridayExp = atLeastFiveDays.find((exp) => new Date(exp * 1000).getUTCDay() === 5)
    return fridayExp || atLeastFiveDays[0] || availableExpirations[0]
  }, [availableExpirations])

  // Auto-select/reset expiry
  useEffect(() => {
    if (defaultExpiry && !selectedExpiry) setSelectedExpiry(defaultExpiry)
    if (
      selectedExpiry &&
      availableExpirations.length > 0 &&
      !availableExpirations.includes(selectedExpiry)
    ) {
      setSelectedExpiry(defaultExpiry)
    }
  }, [defaultExpiry, availableExpirations, selectedExpiry])

  // Filter series to selected expiry
  const filteredSeries = useMemo(() => {
    if (!seriesList || !selectedExpiry) return []
    return seriesList.filter((s) => s.expiration === selectedExpiry)
  }, [seriesList, selectedExpiry])

  // Build available strikes (OTM only, APR > 2%)
  const availableStrikes = useMemo(() => {
    if (!selectedAsset) return []
    const spotPrice = selectedAsset.price
    const strikeMap = new Map<number, { strikePrice: number; apr: BN; series: Series }>()

    for (const s of filteredSeries) {
      const isOTM = isSellDirection
        ? s.strikePrice > spotPrice
        : s.strikePrice < spotPrice
      if (!isOTM) continue
      if (s.collateralRewardAPR.isGreaterThan(0.02)) {
        const existing = strikeMap.get(s.strikePrice)
        if (!existing || s.collateralRewardAPR.isGreaterThan(existing.apr)) {
          strikeMap.set(s.strikePrice, { strikePrice: s.strikePrice, apr: s.collateralRewardAPR, series: s })
        }
      }
    }

    const sorted = [...strikeMap.values()]
    return isSellDirection
      ? sorted.sort((a, b) => a.strikePrice - b.strikePrice)
      : sorted.sort((a, b) => b.strikePrice - a.strikePrice)
  }, [filteredSeries, isSellDirection, selectedAsset])

  // Auto-select first strike
  useEffect(() => {
    if (availableStrikes.length > 0) {
      const stillValid = selectedStrike && availableStrikes.some((s) => s.strikePrice === selectedStrike)
      if (!stillValid) setSelectedStrike(availableStrikes[0].strikePrice)
    }
  }, [availableStrikes, selectedStrike])

  // Reset selections on asset change
  useEffect(() => {
    setSelectedStrike(undefined)
    setSelectedExpiry(undefined)
  }, [selectedAsset?.symbol])

  // Current series data
  const selectedSeriesData = useMemo(
    () => availableStrikes.find((s) => s.strikePrice === selectedStrike),
    [availableStrikes, selectedStrike],
  )
  const apr = selectedSeriesData?.apr
  const selectedSeries = selectedSeriesData?.series

  // Estimated premium
  const estimatedPremium = useMemo(() => {
    if (!apr || !selectedStrike || !Number(amount) || !selectedExpiry) return undefined
    const timeToExpiry = (selectedExpiry - Math.floor(Date.now() / 1000)) / (365 * 24 * 3600)
    return Number(amount) * selectedStrike * apr.toNumber() * timeToExpiry
  }, [apr, selectedStrike, amount, selectedExpiry])

  // Deposit amount for display
  const depositDisplay = useMemo(() => {
    if (!selectedStrike || !Number(amount)) return undefined
    return isSellDirection
      ? `${amount}`
      : `${formatPrice(Number(amount) * selectedStrike)}`
  }, [selectedStrike, amount, isSellDirection])

  // Token symbols
  // Asset selector always shows the underlying contract symbol (e.g. UETH, WHYPE)
  const assetDisplaySymbol = useMemo(() => {
    if (!selectedAsset) return ""
    return PROTOCOL_TO_CONTRACT_SYMBOL[selectedAsset.symbol] || selectedAsset.symbol
  }, [selectedAsset])

  // Collateral symbol depends on direction:
  // Covered call (sell): underlying contract token; Cash-secured put (buy): strike/stablecoin
  const collateralSymbol = useMemo(() => {
    if (!selectedAsset) return ""
    if (isSellDirection) {
      return PROTOCOL_TO_CONTRACT_SYMBOL[selectedAsset.symbol] || selectedAsset.symbol
    }
    return selectedSeries?.collateralTokenSymbol || selectedAsset.strikeAsset?.symbol || "USD\u20ae0"
  }, [selectedAsset, isSellDirection, selectedSeries])

  const strikeTokenSymbol = selectedSeries?.strikeTokenSymbol || selectedAsset?.strikeAsset?.symbol || "USD\u20ae0"

  // Allowance check
  const { data: protocolAddresses } = useAddresses(provider)
  // For covered calls, collateral is the underlying token (e.g. WHYPE 18 decimals)
  // For cash-secured puts, collateral is the pool's collateral token (e.g. USDT0 6 decimals)
  const collateralDecimals = isSellDirection
    ? (selectedAsset?.decimals ?? 18)
    : (selectedSeries?.collateralTokenDecimals ?? 6)
  const requiredAmount = useMemo(() => {
    if (!selectedStrike || !Number(amount) || !selectedSeries) return undefined
    const size = new BN(amount)
    if (!isSellDirection) {
      return size.multipliedBy(selectedStrike).shiftedBy(collateralDecimals)
    }
    return size.shiftedBy(collateralDecimals)
  }, [selectedStrike, amount, isSellDirection, selectedSeries, collateralDecimals])

  const collateralTokenAddress = useMemo(() => {
    if (!selectedSeries || !selectedAsset) return undefined
    return isSellDirection ? selectedAsset.id : selectedSeries.collateralTokenAddress
  }, [selectedSeries, selectedAsset, isSellDirection])

  const allowance = useAllowance(
    provider,
    collateralTokenAddress,
    protocolAddresses?.tradeExecutor,
    address,
    requiredAmount?.decimalPlaces(0),
  )

  // ─── Dropdowns ────────────────────────────────────────────────────────────
  const [showPriceMenu, setShowPriceMenu] = useState(false)
  const [showExpiryMenu, setShowExpiryMenu] = useState(false)
  const [showAssetMenu, setShowAssetMenu] = useState(false)
  const priceRef = useRef<HTMLDivElement>(null)
  const expiryRef = useRef<HTMLDivElement>(null)
  const assetRef = useRef<HTMLDivElement>(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (priceRef.current && !priceRef.current.contains(e.target as Node)) setShowPriceMenu(false)
      if (expiryRef.current && !expiryRef.current.contains(e.target as Node)) setShowExpiryMenu(false)
      if (assetRef.current && !assetRef.current.contains(e.target as Node)) setShowAssetMenu(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // ─── Trade Flow ───────────────────────────────────────────────────────────

  const handleLockIn = useCallback(async () => {
    if (!signer || !address || !selectedSeries || !selectedAsset || !selectedExpiry) return

    setTradeState("quoting")
    setTradeError("")

    try {
      // Build order data — leg amounts use 8 decimals (STRIKE_PRICE_DECIMALS)
      const STRIKE_PRICE_DECIMALS = 8
      const rawAmount = new BN(amount)
        .decimalPlaces(6, BN.ROUND_DOWN)
        .multipliedBy(new BN(10).pow(STRIKE_PRICE_DECIMALS))
        .negated()
        .decimalPlaces(0, BN.ROUND_DOWN)
        .toFixed()

      const orderData = {
        account: address,
        poolAddress: selectedSeries.poolAddress,
        underlying: selectedAsset.id,
        collateral: isSellDirection ? selectedAsset.id : selectedAsset.collateralAsset.id,
        referrer: "0x0000000000000000000000000000000000000000",
        legs: [
          {
            symbol: `${selectedSeries.underlyingTokenSymbol}-${dayjs
              .unix(selectedSeries.expiration)
              .format("DDMMMYY")
              .toUpperCase()}-${selectedSeries.strikePrice}-${selectedSeries.type[0]}`,
            amount: rawAmount,
          },
        ],
      }

      // Check allowance and approve if needed
      if (allowance.data && !allowance.data.isSpendAllowed) {
        setTradeState("approving")
        await approveToken(
          signer,
          collateralTokenAddress!,
          protocolAddresses!.tradeExecutor,
          requiredAmount!.decimalPlaces(0),
        )
        await allowance.refetch()
      }

      // Fetch signed quote and execute trade
      setTradeState("confirming")
      const signedOrder = await fetchQuote(orderData, true, selectedAsset)
      const txHash = await executeTrade(signer, signedOrder)

      setTradeTxHash(txHash)
      setTradeState("success")
    } catch (e) {
      setTradeError(e instanceof Error ? e.message : String(e))
      setTradeState("error")
    }
  }, [signer, address, selectedSeries, selectedAsset, selectedExpiry, amount, isSellDirection, allowance, collateralTokenAddress, protocolAddresses, requiredAmount])

  const handleReset = useCallback(() => {
    setTradeState("idle")
    setTradeError("")
    setTradeTxHash("")
  }, [])

  // ─── Render ───────────────────────────────────────────────────────────────

  // Success dialog
  if (tradeState === "success" && selectedSeries) {
    return (
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
        <LockedOrderSuccess
          assetSymbol={selectedAsset?.symbol || ""}
          strikePrice={selectedSeries.strikePrice}
          expiration={selectedSeries.expiration}
          premium={estimatedPremium !== undefined ? formatPrice(estimatedPremium) : "0"}
          premiumSymbol={strikeTokenSymbol}
          apr={apr ? formatPercent(apr.toNumber()) : "0%"}
          txHash={tradeTxHash}
          isSellDirection={isSellDirection}
          onClose={handleReset}
        />
      </div>
    )
  }

  const isLoading = assetsLoading || seriesLoading

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-4">
      {/* Buy/Sell Toggle */}
      <div className="bg-gray-800 rounded-lg p-0.5 flex">
        <button
          onClick={() => setStrategyType("CashSecuredPut")}
          className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${
            !isSellDirection ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-300"
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setStrategyType("CoveredCall")}
          className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${
            isSellDirection ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-300"
          }`}
        >
          Sell
        </button>
      </div>

      {/* Amount Input */}
      <div className="bg-gray-800 rounded-xl p-4">
        <div className="text-xs text-gray-500 mb-2">Amount</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="flex-1 bg-transparent text-2xl font-medium outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            min="0"
            step="any"
          />

          {/* Asset selector */}
          <div ref={assetRef} className="relative">
            <button
              onClick={() => setShowAssetMenu(!showAssetMenu)}
              className="flex items-center gap-2 bg-gray-700 rounded-full px-3 py-1.5 hover:bg-gray-600 transition-colors"
            >
              <span className="text-sm font-medium">{assetDisplaySymbol}</span>
              <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showAssetMenu && assets && (
              <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10 min-w-[140px]">
                {assets.map((asset) => (
                  <button
                    key={asset.symbol}
                    onClick={() => { setSelectedAsset(asset); setShowAssetMenu(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg ${
                      asset.symbol === selectedAsset?.symbol ? "bg-gray-700" : ""
                    }`}
                  >
                    {PROTOCOL_TO_CONTRACT_SYMBOL[asset.symbol] || asset.symbol}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          {selectedAsset?.price && Number(amount) > 0
            ? `$${formatPrice(Number(amount) * selectedAsset.price)}`
            : "\u2014"}
        </div>
      </div>

      {/* Details: Unlock, Price, Premium, APR, Deposit */}
      <div className="bg-gray-800/50 rounded-xl p-4 space-y-2">
        {/* Unlock date */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Unlock</span>
          <div ref={expiryRef} className="relative">
            <button
              onClick={() => setShowExpiryMenu(!showExpiryMenu)}
              className="font-mono font-medium hover:text-white transition-colors flex items-center gap-1"
            >
              {selectedExpiry ? dayjs.unix(selectedExpiry).format("MMM D, YYYY") : "\u2014"}
              <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showExpiryMenu && (
              <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10 min-w-[160px]">
                {availableExpirations.map((exp) => (
                  <button
                    key={exp}
                    onClick={() => { setSelectedExpiry(exp); setShowExpiryMenu(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 font-mono first:rounded-t-lg last:rounded-b-lg ${
                      exp === selectedExpiry ? "bg-gray-700" : ""
                    }`}
                  >
                    {dayjs.unix(exp).format("MMM D, YYYY")}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Price selector */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Price</span>
          <div ref={priceRef} className="relative">
            <button
              onClick={() => setShowPriceMenu(!showPriceMenu)}
              className="font-mono font-medium hover:text-white transition-colors flex items-center gap-1"
            >
              {selectedStrike ? `$${formatPrice(selectedStrike)}` : "\u2014"}
              <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showPriceMenu && (
              <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10 min-w-[200px]">
                <div className="flex px-3 py-1.5 text-xs text-gray-500 border-b border-gray-700">
                  <span className="flex-1">Price</span>
                  <span>APR</span>
                </div>
                {availableStrikes.map((s) => (
                  <button
                    key={s.strikePrice}
                    onClick={() => { setSelectedStrike(s.strikePrice); setShowPriceMenu(false) }}
                    className={`w-full flex justify-between px-3 py-2 text-sm hover:bg-gray-700 font-mono last:rounded-b-lg ${
                      s.strikePrice === selectedStrike ? "bg-gray-700" : ""
                    }`}
                  >
                    <span>${formatPrice(s.strikePrice)}</span>
                    <span className="text-gray-400 text-xs">{formatPercent(s.apr.toNumber())}</span>
                  </button>
                ))}
                {availableStrikes.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">No strikes available</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-700/50 my-1" />

        {/* Premium */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Upfront premium</span>
          <span className="font-mono font-medium">
            {estimatedPremium !== undefined
              ? `$${formatPrice(estimatedPremium)} ${strikeTokenSymbol}`
              : "\u2014"}
          </span>
        </div>

        {/* APR */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">APR</span>
          <span className="font-mono font-medium text-green-400">
            {apr ? formatPercent(apr.toNumber()) : "\u2014"}
          </span>
        </div>

        {/* Deposit */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Deposit</span>
          <span className="font-mono font-medium">
            {depositDisplay
              ? `${depositDisplay} ${collateralSymbol}`
              : "\u2014"}
          </span>
        </div>
      </div>

      {/* Outcome Card */}
      {selectedAsset && (
        <OutcomeCard
          assetSymbol={selectedAsset.symbol}
          strikePrice={selectedStrike}
          amount={amount}
          expiration={selectedExpiry}
          strikeTokenSymbol={strikeTokenSymbol}
          isSellDirection={isSellDirection}
          formatPrice={formatPrice}
        />
      )}

      {/* Action Button */}
      <div>
        {!address ? (
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        ) : !selectedStrike ? (
          <button disabled className="w-full py-3 px-4 bg-gray-700 text-gray-400 rounded-xl font-medium cursor-not-allowed">
            {isLoading ? "Loading..." : "Select a target price"}
          </button>
        ) : !Number(amount) ? (
          <button disabled className="w-full py-3 px-4 bg-gray-700 text-gray-400 rounded-xl font-medium cursor-not-allowed">
            Enter amount
          </button>
        ) : tradeState === "quoting" ? (
          <button disabled className="w-full py-3 px-4 bg-gray-700 text-gray-300 rounded-xl font-medium cursor-not-allowed animate-pulse">
            Getting Quote...
          </button>
        ) : tradeState === "approving" ? (
          <button disabled className="w-full py-3 px-4 bg-gray-700 text-gray-300 rounded-xl font-medium cursor-not-allowed animate-pulse">
            Approving...
          </button>
        ) : tradeState === "confirming" ? (
          <button disabled className="w-full py-3 px-4 bg-gray-700 text-gray-300 rounded-xl font-medium cursor-not-allowed animate-pulse">
            Confirming Trade...
          </button>
        ) : (
          <button
            onClick={handleLockIn}
            className="w-full py-3 px-4 bg-white text-gray-900 rounded-xl font-medium hover:bg-gray-100 transition-colors"
          >
            Lock In
          </button>
        )}

        {/* Error message */}
        {tradeState === "error" && tradeError && (
          <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {tradeError}
            <button
              onClick={handleReset}
              className="ml-2 underline hover:text-red-300"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
