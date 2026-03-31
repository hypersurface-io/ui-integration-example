/**
 * Hypersurface SDK Configuration
 *
 * Chain config, token addresses, and API endpoints for HyperEVM.
 * This file contains all the static configuration needed to interact
 * with the Hypersurface protocol.
 */

export const CHAIN_ID = 999 // HyperEVM

export const CHAIN_CONFIG = {
  chainId: CHAIN_ID,
  chainName: "HyperEVM",
  rpcUrl: "https://rpc.hyperliquid.xyz/evm",
  subgraphUrl:
    "https://api.goldsky.com/api/public/project_clysuc3c7f21y01ub6hd66nmp/subgraphs/hypersurface-sh-subgraph/latest/gn",
  quoteProviderUrl: "https://market-api-sh.hypersurface.io",
  addressBookAddress: "0x4a400778ddd7331a4f716f062eda4f66ef3bbb51",
  poolAddress: "0x0095acdd705cfcc11eaffb6c19a28c0153ad196f",
  blockExplorerUrl: "https://hyperevmscan.io",
} as const

export type TokenMeta = {
  name: string
  symbol: string
  address: string
  decimals: number
  isNative?: boolean
  isCollateral?: boolean
}

/** All tokens on HyperEVM used by Hypersurface */
export const TOKENS: Record<string, TokenMeta> = {
  HYPE: {
    name: "HYPE",
    symbol: "HYPE",
    address: "0x2222222222222222222222222222222222222222",
    decimals: 18,
    isNative: true,
  },
  WHYPE: {
    name: "Wrapped HYPE",
    symbol: "WHYPE",
    address: "0x5555555555555555555555555555555555555555",
    decimals: 18,
  },
  "USD₮0": {
    name: "USD₮0",
    symbol: "USD₮0",
    address: "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb",
    decimals: 6,
    isCollateral: true,
  },
  UBTC: {
    name: "Unit BTC",
    symbol: "UBTC",
    address: "0x9fdbda0a5e284c32744d2f17ee5c74b284993463",
    decimals: 8,
  },
  UETH: {
    name: "Unit ETH",
    symbol: "UETH",
    address: "0xbe6727b535545c67d5caa73dea54865b92cf7907",
    decimals: 18,
  },
  UXPL: {
    name: "Unit XPL",
    symbol: "UXPL",
    address: "0x33af3c2540ba72054e044efe504867b39ae421f5",
    decimals: 18,
  },
  UPUMP: {
    name: "Unit PUMP",
    symbol: "UPUMP",
    address: "0x27ec642013bcb3d80ca3706599d3cda04f6f4452",
    decimals: 6,
  },
  USOL: {
    name: "Unit SOL",
    symbol: "USOL",
    address: "0x068f321fa8fb9f0d135f290ef6a3e2813e1c8a29",
    decimals: 9,
  },
  UENA: {
    name: "Unit ENA",
    symbol: "UENA",
    address: "0x58538e6a46e07434d7e7375bc268d3cb839c0133",
    decimals: 18,
  },
  KNTQ: {
    name: "Kinetiq",
    symbol: "KNTQ",
    address: "0x000000000000780555bd0bca3791f89f9542c2d6",
    decimals: 18,
  },
  kHYPE: {
    name: "Kinetiq Staked HYPE",
    symbol: "kHYPE",
    address: "0xfd739d4e423301ce9385c1fb8850539d657c296d",
    decimals: 18,
  },
}

/** Maps underlying asset symbol (e.g., "ETH") to its contract token symbol (e.g., "UETH") */
export const PROTOCOL_TO_CONTRACT_SYMBOL: Record<string, string> = {
  HYPE: "WHYPE",
  BTC: "UBTC",
  ETH: "UETH",
  XPL: "UXPL",
  PUMP: "UPUMP",
  SOL: "USOL",
  ENA: "UENA",
  KNTQ: "KNTQ",
  kHYPE: "kHYPE",
}

/** Maps contract token symbol (e.g., "UETH") back to underlying symbol (e.g., "ETH") */
export const CONTRACT_TO_PROTOCOL_SYMBOL: Record<string, string> = {
  WHYPE: "HYPE",
  UBTC: "BTC",
  UETH: "ETH",
  UXPL: "XPL",
  UPUMP: "PUMP",
  USOL: "SOL",
  UENA: "ENA",
  KNTQ: "KNTQ",
  kHYPE: "kHYPE",
}

/** Assets enabled for trading */
export const ENABLED_ASSETS = [
  "HYPE", "BTC", "ETH", "XPL", "PUMP", "SOL", "ENA", "KNTQ", "kHYPE",
]

/** Multipliers for certain assets (e.g., BTC uses 2x leverage) */
export const ASSET_MULTIPLIERS: Record<string, number | undefined> = {
  BTC: 2,
}

/** Price alias map — use another asset's price for pricing (e.g., kHYPE uses HYPE price) */
export const PRICE_ALIAS_MAP: Record<string, string> = {
  kHYPE: "HYPE",
}

/** Staked token mapping — maps staked token to its base token */
export const STAKED_TOKENS: Record<string, string> = {
  kHYPE: "HYPE",
}

/** Strike price decimals used by the protocol (8 decimals) */
export const STRIKE_PRICE_DECIMALS = 8
