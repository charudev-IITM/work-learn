import { useReferenceRates } from '../../hooks/useReferenceRates'
import type { RateEntry } from '@comp-intel/shared/stores/rateStore'
import { AnimatedPrice } from '../ui/animated-price'
import { getRelativeTime } from '@comp-intel/shared/lib/formatters'
import { cn } from '../../lib/cn'

/** Compact Indian format without decimals */
function fmtINR(v: number): string {
  return '₹' + Math.round(v).toLocaleString('en-IN')
}

/** USD format with 2 decimals */
function fmtUSD(v: number): string {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function QuickGlanceCards() {
  const refs = useReferenceRates()

  return (
    <div className={cn(
      "rounded-2xl overflow-hidden",
      // Light mode
      "bg-white border border-gray-200/80 shadow-sm",
      // Dark mode
      "dark:bg-white/[0.04] dark:border-white/[0.08] dark:backdrop-blur-xl",
    )}>
      {/* ── MCX ─────────────────────────────────── */}
      <div className="px-3.5 pt-3 pb-2.5">
        <SectionLabel label="MCX" timestamp={refs.mcxGold?.timestamp || refs.mcxSilver?.timestamp} />
        <div className="grid grid-cols-2 gap-4 mt-2">
          <MCXColumn label="Gold" color="amber" data={refs.mcxGold} />
          <MCXColumn label="Silver" color="slate" data={refs.mcxSilver} />
        </div>
      </div>

      <Divider />

      {/* ── COMEX ────────────────────────────────── */}
      <div className="px-3.5 py-2.5">
        <SectionLabel label="COMEX" timestamp={refs.goldSpot?.timestamp || refs.silverSpot?.timestamp} />
        <div className="mt-1.5 space-y-1">
          <RateRow label="Gold" color="amber" data={refs.goldSpot} formatter={fmtUSD} />
          <RateRow label="Silver" color="slate" data={refs.silverSpot} formatter={fmtUSD} />
        </div>
      </div>

      <Divider />

      {/* ── LBMA LONDON ──────────────────────────── */}
      <div className="px-3.5 pt-2.5 pb-3">
        <SectionLabel label="LBMA London" timestamp={refs.goldAmFix?.timestamp || refs.goldPmFix?.timestamp || refs.silverFix?.timestamp} />
        <div className="mt-1.5 space-y-1">
          <RateRow label="Gold AM Fix" color="amber" data={refs.goldAmFix} formatter={fmtUSD} />
          <RateRow label="Gold PM Fix" color="amber" data={refs.goldPmFix} formatter={fmtUSD} />
          <RateRow label="Silver Fix" color="slate" data={refs.silverFix} formatter={fmtUSD} />
        </div>
      </div>
    </div>
  )
}

/* ── Section label with timestamp ──────────────────────────────────────── */

function SectionLabel({ label, timestamp }: { label: string; timestamp?: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-gray-400 dark:text-white/35">
        {label}
      </span>
      {timestamp && (
        <span className="text-[9px] text-gray-350 dark:text-white/25">
          {getRelativeTime(timestamp)}
        </span>
      )}
    </div>
  )
}

/* ── Divider ───────────────────────────────────────────────────────────── */

function Divider() {
  return <div className="h-px bg-gray-100 dark:bg-white/[0.06] mx-3.5" />
}

/* ── MCX column (hero price + H/L/B/S detail) ──────────────────────────── */

function MCXColumn({ label, color, data }: { label: string; color: 'amber' | 'slate'; data: RateEntry | null }) {
  const rate = data?.sell_rate || data?.buy_rate
  const isGold = color === 'amber'

  return (
    <div>
      {/* Label */}
      <span className={cn(
        "text-[10px] font-bold tracking-wide uppercase",
        isGold ? "text-amber-500 dark:text-amber-400" : "text-gray-400 dark:text-white/40",
      )}>
        {label}
      </span>

      {/* Hero price */}
      {rate ? (
        <div className="mt-0.5">
          <AnimatedPrice
            value={rate}
            formatter={fmtINR}
            showTrend
            className={cn(
              "text-[19px] font-extrabold font-mono tracking-tight leading-none",
              "text-gray-950 dark:text-white",
            )}
          />

          {/* H/L/B/S micro-grid */}
          {(data!.high_rate != null || data!.low_rate != null) && (
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-1.5">
              {data!.high_rate != null && (
                <MicroStat label="H" value={fmtINR(data!.high_rate)} />
              )}
              {data!.low_rate != null && (
                <MicroStat label="L" value={fmtINR(data!.low_rate)} />
              )}
              {data!.buy_rate != null && (
                <MicroStat label="B" value={fmtINR(data!.buy_rate)} />
              )}
              {data!.sell_rate != null && (
                <MicroStat label="S" value={fmtINR(data!.sell_rate)} />
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="text-lg font-extrabold font-mono text-gray-300 dark:text-white/20 mt-0.5">--</div>
      )}
    </div>
  )
}

/* ── Micro stat (H/L/B/S label + value) ─────────────────────────────── */

function MicroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[8px] font-bold text-gray-350 dark:text-white/25 w-2 shrink-0">{label}</span>
      <span className="text-[10px] font-semibold font-mono text-gray-500 dark:text-white/50 truncate">{value}</span>
    </div>
  )
}

/* ── COMEX / LBMA rate row (label left, price right) ─────────────────── */

function RateRow({ label, color, data, formatter }: {
  label: string
  color: 'amber' | 'slate'
  data: RateEntry | null
  formatter: (v: number) => string
}) {
  const rate = data?.sell_rate || data?.buy_rate
  const isGold = color === 'amber'

  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={cn(
        "text-[11px] font-semibold",
        isGold ? "text-amber-600 dark:text-amber-400/80" : "text-gray-400 dark:text-white/40",
      )}>
        {label}
      </span>
      {rate ? (
        <AnimatedPrice
          value={rate}
          formatter={formatter}
          showTrend
          className="text-[13px] font-bold font-mono text-gray-900 dark:text-white/90"
        />
      ) : (
        <span className="text-[13px] font-bold font-mono text-gray-300 dark:text-white/20">--</span>
      )}
    </div>
  )
}
