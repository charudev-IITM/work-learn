import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { Button } from '../ui/button'
import { adminService, type OnlineHistoryPoint } from '../../services/admin'

// ── Sparkline (compact, for stat card) ────────────────────────────────────

interface SparklineProps {
  points: OnlineHistoryPoint[]
  width?: number
  height?: number
  color?: string
}

export function OnlineMiniSparkline({ points, width = 80, height = 24, color = '#f59e0b' }: SparklineProps) {
  if (points.length < 2) return null

  const values = points.map(p => p.v)
  const maxV = Math.max(...values, 1)
  const minV = Math.min(...values)
  const range = maxV - minV || 1

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width
    const y = height - ((p.v - minV) / range) * (height - 2) - 1
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const fillCoords = [
    `0,${height}`,
    ...coords,
    `${width},${height}`,
  ].join(' ')

  return (
    <svg width={width} height={height} className="block">
      <polygon points={fillCoords} fill={color} opacity={0.15} />
      <polyline points={coords.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  )
}

// ── Full Chart Dialog ─────────────────────────────────────────────────────

interface DialogProps {
  open: boolean
  onClose: () => void
  currentCount: number
}

type ChartRange = 'today' | '7d'

const CHART_W = 600
const CHART_H = 160
const PAD = { left: 44, right: 12, top: 14, bottom: 28 }
const AREA_W = CHART_W - PAD.left - PAD.right
const AREA_H = CHART_H - PAD.top - PAD.bottom

function downsample(points: OnlineHistoryPoint[], maxPoints: number): OnlineHistoryPoint[] {
  if (points.length <= maxPoints) return points
  const step = Math.ceil(points.length / maxPoints)
  const result: OnlineHistoryPoint[] = []
  for (let i = 0; i < points.length; i += step) {
    result.push(points[i])
  }
  // Always include the last point
  if (result[result.length - 1] !== points[points.length - 1]) {
    result.push(points[points.length - 1])
  }
  return result
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatDateShort(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function OnlineHistoryDialog({ open, onClose, currentCount }: DialogProps) {
  const [range, setRange] = useState<ChartRange>('today')
  const [data, setData] = useState<OnlineHistoryPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const fetchData = useCallback(async (r: ChartRange) => {
    setLoading(true)
    setError(false)
    try {
      const result = await adminService.getOnlineHistory(r)
      setData(result.points)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) fetchData(range)
  }, [open, range, fetchData])

  const points = downsample(data, 550)
  const values = points.map(p => p.v)
  const maxV = Math.max(...values, 1)
  const peakV = values.length > 0 ? Math.max(...values) : 0
  const avgV = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0

  const minT = points.length > 0 ? points[0].t : 0
  const maxT = points.length > 0 ? points[points.length - 1].t : 1
  const tRange = maxT - minT || 1

  const xScale = (t: number) => PAD.left + ((t - minT) / tRange) * AREA_W
  const yScale = (v: number) => PAD.top + AREA_H - (v / maxV) * AREA_H

  // Build polyline + fill polygon
  const linePoints = points.map(p => `${xScale(p.t).toFixed(1)},${yScale(p.v).toFixed(1)}`).join(' ')
  const fillPoints = points.length > 0
    ? [
        `${xScale(minT).toFixed(1)},${yScale(0).toFixed(1)}`,
        ...points.map(p => `${xScale(p.t).toFixed(1)},${yScale(p.v).toFixed(1)}`),
        `${xScale(maxT).toFixed(1)},${yScale(0).toFixed(1)}`,
      ].join(' ')
    : ''

  // X-axis labels
  const xLabelCount = range === 'today' ? 6 : 7
  const xLabels: { x: number; label: string }[] = []
  if (points.length > 0) {
    for (let i = 0; i < xLabelCount; i++) {
      const t = minT + (tRange * i) / (xLabelCount - 1)
      xLabels.push({
        x: xScale(t),
        label: range === 'today' ? formatTime(t) : formatDateShort(t),
      })
    }
  }

  // Y-axis labels
  const yLabels = [0, Math.round(maxV / 2), maxV]

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Online Users</DialogTitle>
          <DialogDescription>
            Currently <span className="font-semibold text-foreground">{currentCount}</span> users online
          </DialogDescription>
        </DialogHeader>

        {/* Stats row */}
        <div className="flex gap-4 text-sm">
          <div className="rounded-lg border px-3 py-2 flex-1 text-center">
            <p className="text-muted-foreground text-xs">Current</p>
            <p className="font-bold text-lg tabular-nums">{currentCount}</p>
          </div>
          <div className="rounded-lg border px-3 py-2 flex-1 text-center">
            <p className="text-muted-foreground text-xs">Peak</p>
            <p className="font-bold text-lg tabular-nums">{peakV}</p>
          </div>
          <div className="rounded-lg border px-3 py-2 flex-1 text-center">
            <p className="text-muted-foreground text-xs">Average</p>
            <p className="font-bold text-lg tabular-nums">{avgV}</p>
          </div>
        </div>

        {/* Range toggle */}
        <div className="flex items-center justify-between">
          <div className="flex rounded-lg border overflow-hidden">
            {(['today', '7d'] as const).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  range === r ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                {r === 'today' ? 'Today' : '7 Days'}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => fetchData(range)} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Chart area */}
        <div className="rounded-lg border bg-muted/20 p-2">
          {loading && data.length === 0 ? (
            <div className="flex items-center justify-center h-[160px]">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : error && data.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[160px] text-muted-foreground">
              <p className="text-sm mb-2">Failed to load data</p>
              <Button variant="outline" size="sm" onClick={() => fetchData(range)}>
                <RefreshCw className="w-3.5 h-3.5 mr-2" />Retry
              </Button>
            </div>
          ) : points.length === 0 ? (
            <div className="flex items-center justify-center h-[160px] text-muted-foreground text-sm">
              No data yet — samples are recorded every minute
            </div>
          ) : (
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-auto">
              {/* Grid lines */}
              {yLabels.map(v => (
                <line
                  key={v}
                  x1={PAD.left} y1={yScale(v)}
                  x2={CHART_W - PAD.right} y2={yScale(v)}
                  stroke="currentColor" strokeOpacity={0.1} strokeDasharray="4 4"
                />
              ))}

              {/* Y-axis labels */}
              {yLabels.map(v => (
                <text
                  key={v}
                  x={PAD.left - 6} y={yScale(v) + 4}
                  textAnchor="end" fontSize={10} fill="currentColor" opacity={0.5}
                  className="tabular-nums"
                >
                  {v}
                </text>
              ))}

              {/* X-axis labels */}
              {xLabels.map((lbl, i) => (
                <text
                  key={i}
                  x={lbl.x} y={CHART_H - 4}
                  textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.5}
                >
                  {lbl.label}
                </text>
              ))}

              {/* Area fill */}
              <polygon points={fillPoints} fill="#f59e0b" opacity={0.12} />

              {/* Line */}
              <polyline
                points={linePoints}
                fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeLinejoin="round"
              />

              {/* Current point dot */}
              {points.length > 0 && (
                <circle
                  cx={xScale(points[points.length - 1].t)}
                  cy={yScale(points[points.length - 1].v)}
                  r={3} fill="#f59e0b"
                />
              )}
            </svg>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
