import React from "react"
import dayjs from "dayjs"
import { PROTOCOL_TO_CONTRACT_SYMBOL } from "../sdk"

type OutcomeCardProps = {
  assetSymbol: string
  strikePrice: number | undefined
  amount: string
  expiration: number | undefined
  strikeTokenSymbol: string
  isSellDirection: boolean
  formatPrice: (n: number) => string
}

export const OutcomeCard: React.FC<OutcomeCardProps> = ({
  assetSymbol,
  strikePrice,
  amount,
  expiration,
  strikeTokenSymbol,
  isSellDirection,
  formatPrice,
}) => {
  const contractSymbol = PROTOCOL_TO_CONTRACT_SYMBOL[assetSymbol] || assetSymbol
  const hasValues = strikePrice !== undefined && Number(amount) > 0

  return (
    <div className="rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-900 text-center py-2 px-3 text-sm text-gray-400">
        If on{" "}
        <span className="text-gray-200 font-mono">
          {expiration ? dayjs.unix(expiration).format("M/D/YYYY") : "—"}
        </span>{" "}
        {assetSymbol} is
      </div>

      {/* Columns */}
      <div className="flex bg-gray-800/50">
        {/* BELOW column */}
        <div className="flex-1 p-3 border-r border-dashed border-gray-700">
          <div className="font-bold text-sm text-gray-200">BELOW</div>
          <div className="font-mono text-sm text-gray-400 mt-1">
            {strikePrice ? formatPrice(strikePrice) : "—"}
          </div>
          <div className="text-sm text-gray-400 mt-2">
            {isSellDirection ? "Get back" : "Receive"}
          </div>
          <div className="flex items-center gap-1.5 mt-1 font-mono text-sm font-medium">
            {hasValues ? (
              <>
                <span>{amount}</span>
                <span className="text-xs text-gray-400">{contractSymbol}</span>
              </>
            ) : (
              <span>—</span>
            )}
          </div>
        </div>

        {/* ABOVE column */}
        <div className="flex-1 p-3 text-right">
          <div className="font-bold text-sm text-gray-200">ABOVE</div>
          <div className="font-mono text-sm text-gray-400 mt-1">
            {strikePrice ? formatPrice(strikePrice) : "—"}
          </div>
          <div className="text-sm text-gray-400 mt-2">
            {isSellDirection ? "Receive" : "Get back"}
          </div>
          <div className="flex items-center justify-end gap-1.5 mt-1 font-mono text-sm font-medium">
            {hasValues && strikePrice ? (
              <>
                <span>{formatPrice(Number(amount) * strikePrice)}</span>
                <span className="text-xs text-gray-400">{strikeTokenSymbol}</span>
              </>
            ) : (
              <span>—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
