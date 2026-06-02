import { useMarketStatus } from '../../hooks/useMarketStatus'
import { useReferenceRates } from '../../hooks/useReferenceRates'
import { AnimatedPrice } from '../ui/animated-price'
import { cn } from '../../lib/cn'

export function MarketStatusBar() {
  const { mcx, comex } = useMarketStatus()
  const refs = useReferenceRates()
  // refs used only for INR/USD now — gold/silver shown in spot cards

  return (
    <div className="flex items-center gap-1.5 px-1 py-1.5 border-b border-gray-100 dark:border-white/[0.06] whitespace-nowrap">
      {/* MCX status */}
      <StatusDot isOpen={mcx.isOpen} />
      <span className="text-[10px] font-bold text-gray-500 dark:text-white/50">{mcx.label}</span>

      <span className="text-gray-200 dark:text-white/10">·</span>

      {/* COMEX status */}
      <StatusDot isOpen={comex.isOpen} />
      <span className="text-[10px] font-bold text-gray-500 dark:text-white/50">{comex.label}</span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* INR/USD */}
      <span className="text-[10px] text-gray-400 dark:text-white/35 font-medium">₹/$</span>
      {refs.inrUsd?.sell_rate ? (
        <AnimatedPrice
          value={refs.inrUsd.sell_rate}
          formatter={(v) => v.toFixed(2)}
          showTrend
          className="text-[11px] font-extrabold font-mono text-gray-950 dark:text-white/60"
        />
      ) : (
        <span className="text-[11px] font-bold font-mono text-gray-400 dark:text-white/35">--</span>
      )}
    </div>
  )
}

function StatusDot({ isOpen }: { isOpen: boolean }) {
  return (
    <span
      className={cn(
        "w-1.5 h-1.5 rounded-full shrink-0",
        isOpen
          ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]"
          : "bg-gray-300 dark:bg-white/20",
      )}
    />
  )
}
