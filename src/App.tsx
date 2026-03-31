import { CHAIN_CONFIG, ENABLED_ASSETS } from "./sdk"

function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 flex flex-col items-center pt-12 px-4">
      <h1 className="text-2xl font-medium mb-2">
        Locked Order Example
      </h1>
      <p className="text-gray-500 mb-8">
        Powered by Hypersurface &middot; {CHAIN_CONFIG.chainName}
      </p>

      <div className="w-full max-w-md bg-gray-900 rounded-2xl border border-gray-800 p-6">
        <p className="text-gray-400 text-sm mb-4">SDK loaded. Available assets:</p>
        <ul className="space-y-1">
          {ENABLED_ASSETS.map((asset) => (
            <li key={asset} className="text-sm font-mono">{asset}</li>
          ))}
        </ul>
        <p className="text-gray-500 text-xs mt-4">
          Subgraph: {CHAIN_CONFIG.subgraphUrl.slice(0, 50)}...
        </p>
      </div>
    </div>
  )
}

export default App
