import React from "react"
import dayjs from "dayjs"
import { CHAIN_CONFIG } from "../sdk"

type LockedOrderSuccessProps = {
  assetSymbol: string
  strikePrice: number
  expiration: number
  premium: string
  premiumSymbol: string
  apr: string
  txHash: string
  isSellDirection: boolean
  onClose: () => void
}

export const LockedOrderSuccess: React.FC<LockedOrderSuccessProps> = ({
  assetSymbol,
  strikePrice,
  expiration,
  premium,
  premiumSymbol,
  apr,
  txHash,
  isSellDirection,
  onClose,
}) => {
  const explorerUrl = `${CHAIN_CONFIG.blockExplorerUrl}/tx/${txHash}`

  return (
    <div className="flex flex-col items-center gap-4 max-w-md w-full">
      {/* Check icon */}
      <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
        <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h2 className="text-lg font-medium">Order confirmed!</h2>

      {/* Trade details */}
      <div className="w-full bg-gray-800 rounded-lg p-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">{isSellDirection ? "Asset to sell" : "Asset to buy"}</span>
          <span className="font-medium">{assetSymbol}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Target price</span>
          <span className="font-mono font-medium">
            {strikePrice.toLocaleString(undefined, { maximumFractionDigits: 6 })} {premiumSymbol}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Unlock</span>
          <span className="font-mono font-medium">
            {dayjs.unix(expiration).format("DD MMM YYYY")}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Upfront premium</span>
          <span className="font-mono font-medium">{premium} {premiumSymbol}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">APR</span>
          <span className="font-mono font-medium text-green-400">{apr}</span>
        </div>
        {txHash && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Explorer</span>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono font-medium underline hover:text-white"
            >
              View transaction
            </a>
          </div>
        )}
      </div>

      {/* Actions */}
      <button
        onClick={() => window.open("https://app.hypersurface.finance/positions", "_blank")}
        className="w-full py-3 px-4 bg-white text-gray-900 rounded-xl font-medium hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
      >
        View on Hypersurface
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
        </svg>
      </button>
      <button
        onClick={onClose}
        className="w-full py-3 px-4 bg-gray-800 text-gray-200 rounded-xl font-medium hover:bg-gray-700 transition-colors"
      >
        Close
      </button>

      <p className="text-xs text-gray-600">Powered by Hypersurface</p>
    </div>
  )
}
