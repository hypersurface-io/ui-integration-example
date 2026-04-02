import { BigNumber as BN } from "bignumber.js"

export type OptionSide = "Buy" | "Sell"
export type OptionType = "Call" | "Put"

export const StrategyType = {
  CoveredCall: "CoveredCall",
  CashSecuredPut: "CashSecuredPut",
} as const
export type StrategyType = (typeof StrategyType)[keyof typeof StrategyType]

/** An underlying asset available for trading */
export type UnderlyingAsset = {
  id: string // Contract address
  symbol: string // Protocol symbol (e.g., "ETH")
  decimals: number
  price: number // Current USD price
  collateralAsset: { id: string; symbol: string }
  strikeAsset: { symbol: string }
}

/** An options series with pricing data */
export type Series = {
  id: string // e.g., "ETH-04APR26-2500-C"
  poolAddress: string
  underlyingTokenSymbol: string
  collateralTokenAddress: string
  collateralTokenSymbol: string
  collateralTokenDecimals: number
  strikeTokenSymbol: string
  strikePrice: number
  expiration: number // UNIX timestamp
  type: OptionType
  side: OptionSide
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
  size: string
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
  isSpendAllowed: boolean
}

/** Protocol addresses from the AddressBook contract */
export type ProtocolAddresses = {
  tradeExecutor: string
}

/** Hook return pattern */
export type AsyncState<T> = {
  data: T | undefined
  loading: boolean
  error: Error | undefined
  refetch: () => void
}
