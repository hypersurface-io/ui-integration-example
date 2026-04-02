# CLAUDE.md — Locked Order Example

## What is this repo?

A standalone integration example for Hypersurface Locked Orders — options (covered calls / cash-secured puts) presented as simple limit orders. Two layers:

1. **`src/sdk/`** — Portable integration logic. Pure async functions + React hooks for fetching assets, series, quotes, and executing trades on the Hypersurface protocol.
2. **`src/components/`** — Sample React UI using Tailwind CSS. Shows how to use the SDK hooks.

## Key files

| File | Purpose |
|------|---------|
| `src/sdk/config.ts` | HyperEVM chain config, token addresses, API endpoints |
| `src/sdk/types.ts` | TypeScript interfaces for all SDK data structures |
| `src/sdk/queries.ts` | GraphQL queries for the Hypersurface subgraph |
| `src/sdk/api.ts` | Pure async functions: `fetchAssets`, `fetchSeries`, `fetchQuote`, `executeTrade`, etc. |
| `src/sdk/hooks.ts` | React hooks: `useAssets`, `useSeries`, `useAllowance`, `useAddresses` |
| `src/sdk/index.ts` | Barrel export |
| `src/App.tsx` | RainbowKit + wagmi providers, ethers v5 signer adapter |
| `src/components/LockedOrderCard.tsx` | Main UI: asset selection, amount input, price/expiry selectors, trade flow |
| `src/components/OutcomeCard.tsx` | BELOW/ABOVE outcome display |
| `src/components/LockedOrderSuccess.tsx` | Post-trade success dialog |

## Commands

```bash
yarn dev      # Start dev server (localhost:5173)
yarn build    # TypeScript check + Vite production build
yarn lint     # ESLint
```

## How to make changes

### Adding a new asset
Add the token to `TOKENS`, `PROTOCOL_TO_CONTRACT_SYMBOL`, `CONTRACT_TO_PROTOCOL_SYMBOL`, and `ENABLED_ASSETS` in `src/sdk/config.ts`.

### Adding a new chain
Extend `CHAIN_CONFIG` in `config.ts` with the new chain's RPC, subgraph URL, and quote API URL. Update `App.tsx` to add the chain to wagmi config.

### Modifying the trade flow
The trade flow lives in `LockedOrderCard.tsx`'s `handleLockIn` function. It: (1) builds order data, (2) fetches signed quote, (3) checks/approves allowance, (4) finds vault, (5) executes trade.

### Styling
The sample UI uses Tailwind CSS utility classes. No component library. Restyle by editing class names directly.

## External services

- **Subgraph**: `https://api.goldsky.com/api/public/project_clysuc3c7f21y01ub6hd66nmp/subgraphs/hypersurface-sh-subgraph/latest/gn` — on-chain data (pools, oTokens, vaults)
- **Quote API**: `https://market-api-sh.hypersurface.io` — premiums, prices, signed quotes
- **RPC**: `https://rpc.hyperliquid.xyz/evm` — HyperEVM (chain ID 999)

All public, no API keys required.

## Key contracts

- **HedgedPool** (`0x0095acdd705cfcc11eaffb6c19a28c0153ad196f`) — main trading contract, `trade()` function
- **AddressBook** (`0x4a400778ddd7331a4f716f062eda4f66ef3bbb51`) — stores protocol contract addresses
- Contract ABIs come from `@eng-hypersurface/contracts` package

## Integration checklist

For an agent performing an integration:

1. Copy `src/sdk/` into the target project
2. Install deps: `ethers@^5`, `graphql`, `graphql-request`, `bignumber.js`, `dayjs`, `@eng-hypersurface/contracts`
3. Provide an ethers v5 `Signer` (from your wallet connection)
4. Call `fetchAssets()` to get available tokens
5. Call `fetchSeries(asset, strategyType)` to get available strikes/expirations
6. Build order data with user's selections
7. Call `fetchQuote(orderData, true)` for a signed quote
8. Check/approve token allowance via `checkAllowance` / `approveToken`
9. Call `fetchVaultForSeries(user, seriesPosition, asset)` to find existing vault
10. Call `executeTrade(signer, signedOrder, vaultId)` to execute
