// Config
export { CHAIN_CONFIG, PROTOCOL_TO_CONTRACT_SYMBOL } from "./config"

// Types
export type {
  UnderlyingAsset,
  Series,
  SeriesPosition,
  StrategyType,
} from "./types"

// API — pure async functions
export {
  fetchAssets,
  fetchSeries,
  fetchQuote,
  executeTrade,
  approveToken,
} from "./api"

// Hooks — React hook wrappers
export { useAssets, useSeries, useAllowance, useAddresses } from "./hooks"
