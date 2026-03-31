/**
 * Hypersurface SDK Types
 *
 * All TypeScript interfaces for interacting with the Hypersurface protocol.
 * These types are used by both the pure async functions and the React hooks.
 */

import { BigNumber as BN } from "bignumber.js"

export type OptionSide = "Buy" | "Sell"
export type OptionType = "Call" | "Put"

/** Strategy type derived from the option configuration */
export const StrategyType = {
  CoveredCall: "CoveredCall",
  CashSecuredPut: "CashSecuredPut",
} as const
export type StrategyType = (typeof StrategyType)[keyof typeof StrategyType]

/** An underlying asset available for trading */
export type UnderlyingAsset = {
  id: string // Contract address
  symbol: string // Protocol symbol (e.g., "ETH")
  name: string
  decimals: number
  price: number // Current USD price
  poolAddress: string
  chainId: number
  chainName: string
  chainSymbol: string
  enabled: boolean
  // Strike price range config
  strikeMinPercent: number
  strikeMaxPercent: number
  strikeIncrement: number
  // Expiration config
  expirationMonths: number
  expirationQuarters: number
  dailyAllowed: boolean
  // Related assets
  collateralAsset: {
    id: string
    symbol: string
    name: string
    decimals: number
  }
  strikeAsset: {
    id: string
    symbol: string
    name: string
    decimals: number
  }
}

/** An options series with pricing data */
export type Series = {
  id: string // Unique identifier (e.g., "ETH-04APR26-2500-C")
  poolAddress: string
  underlyingTokenSymbol: string
  underlyingTokenAddress: string
  collateralTokenAddress: string
  collateralTokenSymbol: string
  strikeTokenAddress: string
  strikeTokenSymbol: string
  strikePrice: number
  expiration: number // UNIX timestamp
  type: OptionType
  side: OptionSide
  premium: number
  bid: number
  ask: number
  greeks: {
    delta: number
    gamma: number
    vega: number
    theta: number
    impliedVolatility: number
    riskFreeRate: number
  }
  probabilityOTM: number
  collateralRewardAPR: BN
}

/** A selected series position with size */
export type SeriesPosition = {
  id: string
  underlyingTokenSymbol: string
  type: OptionType
  side: OptionSide
  expiration: number
  strikePrice: number
  size: string // Amount as string for precision
}

/** Order data sent to the quote API */
export type SeriesOrderData = {
  account: string
  poolAddress: string
  underlying: string
  collateral: string
  referrer: string
  legs: Array<{ symbol: string; amount: string }>
}

/** Token allowance check result */
export type AllowanceResult = {
  currentSpendAllowance: BN
  requiredSpendAllowance: BN
  isSpendAllowed: boolean
}

/** Protocol addresses from the AddressBook contract */
export type ProtocolAddresses = {
  controller: string
  tradeExecutor: string
  marginCalculator: string
}

/** Trade execution result */
export type TradeResult = {
  txHash: string
  underlyingTokenSymbol: string
  strikePrice: number
  expiration: number
  type: OptionType
  side: OptionSide
}

/** Hook return pattern */
export type AsyncState<T> = {
  data: T | undefined
  loading: boolean
  error: Error | undefined
  refetch: () => void
}
