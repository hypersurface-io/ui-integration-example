# Locked Order Example

A standalone integration example for **Locked Orders** — covered calls and cash-secured puts presented as simple limit orders with an upfront premium. Built on the [Hypersurface](https://hypersurface.finance) protocol.

Users set a target price, lock their assets, and get paid upfront. No options knowledge required.

## Quick Start

```bash
git clone https://github.com/hypersurface-io/ui-integration-example.git
cd ui-integration-example
yarn install
yarn dev
```

Open `http://localhost:5173` in your browser.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_WALLETCONNECT_PROJECT_ID` | Optional | WalletConnect project ID for RainbowKit. Get one free at [cloud.walletconnect.com](https://cloud.walletconnect.com). Falls back to `"demo"` if not set. |

## Architecture

```
src/
├── sdk/                    # The portable part — copy this into your project
│   ├── config.ts           # Chain config, token addresses, API endpoints
│   ├── types.ts            # All TypeScript interfaces
│   ├── queries.ts          # GraphQL query strings for the subgraph
│   ├── api.ts              # Pure async functions (framework-agnostic)
│   ├── hooks.ts            # React hook wrappers (useState/useEffect)
│   └── index.ts            # Barrel export
├── components/             # Sample UI — for reference only
│   ├── LockedOrderCard.tsx # Main card with trade flow
│   ├── OutcomeCard.tsx     # BELOW/ABOVE outcome display
│   └── LockedOrderSuccess.tsx  # Success dialog
├── App.tsx                 # RainbowKit + wagmi providers
├── main.tsx                # Vite entry point
└── index.css               # Tailwind CSS
```

**Two layers:**
1. **`src/sdk/`** — The integration logic. Framework-agnostic async functions + thin React hooks. This is what you copy into your project.
2. **`src/components/`** — A working sample UI showing how to use the SDK. For reference only — restyle to match your app.

## Integration Guide

### Step 1: Install dependencies

```bash
yarn add ethers@^5 graphql graphql-request bignumber.js dayjs @eng-hypersurface/contracts
```

### Step 2: Copy the SDK

Copy the entire `src/sdk/` directory into your project.

### Step 3: Fetch assets and series

```tsx
import { useAssets, useSeries } from "./sdk"

function MyComponent() {
  const { data: assets, loading } = useAssets()
  const { data: series } = useSeries(assets?.[0], "CoveredCall")

  // assets = available underlying tokens with prices
  // series = available option series with premiums, APR, greeks
}
```

Or use the pure async functions directly (no React required):

```ts
import { fetchAssets, fetchSeries } from "./sdk"

const assets = await fetchAssets()
const series = await fetchSeries(assets[0], "CoveredCall")
```

### Step 4: Get a quote and execute

```ts
import { fetchQuote, executeTrade, approveToken, checkAllowance } from "./sdk"

// Build order data
const orderData = {
  account: userAddress,
  poolAddress: series.poolAddress,
  underlying: asset.id,
  collateral: asset.id, // For covered calls
  referrer: "0x0000000000000000000000000000000000000000",
  legs: [{ symbol: series.id, amount: "-1000000000000000000" }],
}

// Get signed quote
const signedOrder = await fetchQuote(orderData, true, asset)

// Check allowance and approve if needed
const allowance = await checkAllowance(provider, tokenAddress, spenderAddress, userAddress, requiredAmount)
if (!allowance.isSpendAllowed) {
  await approveToken(signer, tokenAddress, spenderAddress, requiredAmount)
}

// Execute trade
const result = await executeTrade(signer, signedOrder, vaultId)
```

### Step 5: Wallet connection

The SDK takes an ethers v5 `Signer` — use your own wallet connection. The sample app uses RainbowKit, but any wallet provider works.

## SDK API Reference

### Pure Async Functions (`api.ts`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `fetchAssets()` | — | `UnderlyingAsset[]` | Fetch available assets with live prices |
| `fetchSeries(asset, strategyType?)` | `UnderlyingAsset`, `"CoveredCall" \| "CashSecuredPut"` | `Series[]` | Fetch option series with premiums and APR |
| `fetchQuote(orderData, sign, asset?)` | `SeriesOrderData`, `boolean`, `UnderlyingAsset?` | `IOrderUtil.OrderStruct` | Get a signed quote from the market maker |
| `executeTrade(signer, signedOrder, vaultId?)` | `ethers.Signer`, `OrderStruct`, `string?` | `TradeResult` | Execute trade on-chain |
| `checkAllowance(provider, token, spender, user, amount)` | `Provider`, addresses, `BN` | `AllowanceResult` | Check token approval status |
| `approveToken(signer, token, spender, amount)` | `Signer`, addresses, `BN` | `ContractReceipt` | Approve token spending |
| `fetchVaultForSeries(user, series, asset)` | `string`, `SeriesPosition`, `UnderlyingAsset` | `string` | Find existing vault or return "0" |
| `fetchAddresses(provider)` | `Provider` | `ProtocolAddresses` | Fetch protocol contract addresses |

### React Hooks (`hooks.ts`)

| Hook | Parameters | Returns | Description |
|------|-----------|---------|-------------|
| `useAssets(options?)` | `{ refetchInterval? }` | `AsyncState<UnderlyingAsset[]>` | Fetch assets with auto-refresh |
| `useSeries(asset, strategy?, options?)` | `UnderlyingAsset`, `StrategyType`, `{ refetchInterval? }` | `AsyncState<Series[]>` | Fetch series, refetches on input change |
| `useAllowance(provider, token, spender, user, amount)` | various | `AsyncState<AllowanceResult>` | Check allowance, auto-refetches every 10s |
| `useAddresses(provider)` | `Provider` | `AsyncState<ProtocolAddresses>` | Fetch protocol addresses, cached |

All hooks return `{ data, loading, error, refetch }`.

## Configuration

All configuration is in `src/sdk/config.ts`:

- **Chain config**: RPC URL, subgraph URL, quote API URL
- **Token addresses**: All HyperEVM tokens with metadata
- **Symbol mappings**: Protocol symbol ↔ contract symbol
- **Staked tokens**: kHYPE → HYPE mapping
- **Enabled assets**: Which assets are available for trading

Currently configured for **HyperEVM only**. To add another chain, extend the config with a new chain entry.

## External Dependencies

| Service | Purpose | Auth |
|---------|---------|------|
| Hypersurface Subgraph (Goldsky) | On-chain data (assets, oTokens, vaults) | Public |
| Hypersurface Quote API | Premiums, prices, signed quotes | Public |
| HyperEVM RPC | Blockchain reads/writes | Public |

## FAQ

**What is a locked order?**
A covered call or cash-secured put, reframed as a limit order. You commit to buy/sell at a target price by a date, and get paid upfront for the commitment.

**Do users need to understand options?**
No. The UI uses swap/limit order language. No mentions of calls, puts, strikes, or Greeks.

**What tokens are supported?**
All assets enabled on HyperEVM: HYPE, BTC, ETH, SOL, XPL, PUMP, ENA, KNTQ, kHYPE.

**Can I use this without React?**
Yes. The `api.ts` functions are pure async — no React dependency. Use them in any JavaScript/TypeScript project.

## License

MIT
