import { useState, useEffect, useCallback, useRef } from "react"
import type { ethers } from "ethers"
import { BigNumber as BN } from "bignumber.js"

import type {
  UnderlyingAsset,
  Series,
  AllowanceResult,
  ProtocolAddresses,
  AsyncState,
  StrategyType,
} from "./types"
import {
  fetchAssets,
  fetchSeries,
  checkAllowance,
  fetchAddresses,
} from "./api"

/**
 * Fetch available underlying assets with current prices.
 */
export function useAssets(
  options: { refetchInterval?: number } = {},
): AsyncState<UnderlyingAsset[]> {
  const [data, setData] = useState<UnderlyingAsset[] | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | undefined>(undefined)
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(undefined)
      const assets = await fetchAssets()
      if (mountedRef.current) setData(assets)
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    load()
    let interval: ReturnType<typeof setInterval> | undefined
    if (options.refetchInterval && options.refetchInterval > 0) {
      interval = setInterval(load, options.refetchInterval)
    }
    return () => {
      mountedRef.current = false
      if (interval) clearInterval(interval)
    }
  }, [load, options.refetchInterval])

  return { data, loading, error, refetch: load }
}

/**
 * Fetch options series for a given asset and strategy.
 */
export function useSeries(
  asset: UnderlyingAsset | undefined,
  strategyType: StrategyType = "CoveredCall",
  options: { refetchInterval?: number } = {},
): AsyncState<Series[]> {
  const [data, setData] = useState<Series[] | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    if (!asset) {
      setData(undefined)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(undefined)
      const series = await fetchSeries(asset, strategyType)
      if (mountedRef.current) setData(series)
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [asset?.symbol, strategyType]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true
    load()
    let interval: ReturnType<typeof setInterval> | undefined
    if (options.refetchInterval && options.refetchInterval > 0) {
      interval = setInterval(load, options.refetchInterval)
    }
    return () => {
      mountedRef.current = false
      if (interval) clearInterval(interval)
    }
  }, [load, options.refetchInterval])

  return { data, loading, error, refetch: load }
}

/**
 * Check token allowance for a spender. Auto-refetches every 10s.
 */
export function useAllowance(
  provider: ethers.providers.Provider | undefined,
  tokenAddress: string | undefined,
  spenderAddress: string | undefined,
  userAddress: string | undefined,
  requiredAmount: BN | undefined,
): AsyncState<AllowanceResult> {
  const [data, setData] = useState<AllowanceResult | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    if (!provider || !tokenAddress || !spenderAddress || !userAddress || !requiredAmount || requiredAmount.lte(0)) {
      setData(undefined)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(undefined)
      const result = await checkAllowance(provider, tokenAddress, spenderAddress, userAddress, requiredAmount)
      if (mountedRef.current) setData(result)
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [provider, tokenAddress, spenderAddress, userAddress, requiredAmount?.toFixed()]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true
    load()
    const interval = setInterval(load, 10_000)
    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [load])

  return { data, loading, error, refetch: load }
}

/**
 * Fetch protocol contract addresses from the AddressBook.
 */
export function useAddresses(
  provider: ethers.providers.Provider | undefined,
): AsyncState<ProtocolAddresses> {
  const [data, setData] = useState<ProtocolAddresses | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    if (!provider) {
      setData(undefined)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(undefined)
      const addresses = await fetchAddresses(provider)
      if (mountedRef.current) setData(addresses)
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [provider])

  useEffect(() => {
    mountedRef.current = true
    load()
    return () => { mountedRef.current = false }
  }, [load])

  return { data, loading, error, refetch: load }
}
