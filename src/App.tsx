import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider, useAccount, useWalletClient } from "wagmi"
import { RainbowKitProvider, ConnectButton, getDefaultConfig } from "@rainbow-me/rainbowkit"
import "@rainbow-me/rainbowkit/styles.css"
import { defineChain } from "viem"
import { useMemo } from "react"
import { ethers } from "ethers"

import { CHAIN_CONFIG } from "./sdk"
import { LockedOrderCard } from "./components/LockedOrderCard"

// Define HyperEVM chain for wagmi/viem
const hyperEVM = defineChain({
  id: CHAIN_CONFIG.chainId,
  name: CHAIN_CONFIG.chainName,
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: {
    default: { http: [CHAIN_CONFIG.rpcUrl] },
  },
  blockExplorers: {
    default: { name: "HyperEVM Explorer", url: CHAIN_CONFIG.blockExplorerUrl },
  },
})

const wagmiConfig = getDefaultConfig({
  appName: "Locked Order Example",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "demo",
  chains: [hyperEVM],
})

const queryClient = new QueryClient()

/** Hook to get an ethers v5 signer from wagmi's wallet client */
export function useEthersSigner(): ethers.Signer | undefined {
  const { data: walletClient } = useWalletClient()
  return useMemo(() => {
    if (!walletClient) return undefined
    const { account, chain, transport } = walletClient
    const network = {
      chainId: chain.id,
      name: chain.name,
      ensAddress: undefined,
    }
    const provider = new ethers.providers.Web3Provider(transport, network)
    return provider.getSigner(account.address)
  }, [walletClient])
}

/** Hook to get an ethers v5 provider from the current chain */
export function useEthersProvider(): ethers.providers.JsonRpcProvider {
  return useMemo(
    () => new ethers.providers.JsonRpcProvider(CHAIN_CONFIG.rpcUrl),
    [],
  )
}

function AppContent() {
  const { address } = useAccount()

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 flex flex-col items-center pt-8 px-4 pb-8">
      <h1 className="text-xl font-medium mb-1">Locked Order</h1>
      <p className="text-gray-500 text-sm mb-6">Get Paid While You Wait</p>

      <div className="w-full max-w-md">
        {!address && (
          <div className="flex justify-center mb-6">
            <ConnectButton />
          </div>
        )}
        <LockedOrderCard />
      </div>

      <p className="text-gray-600 text-xs mt-8">
        Powered by Hypersurface &middot; {CHAIN_CONFIG.chainName}
      </p>
    </div>
  )
}

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <AppContent />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
