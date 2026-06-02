import { useState, useRef, useCallback, RefObject } from 'react'

const PULL_THRESHOLD = 60
const MAX_PULL = 100

export interface PullToRefreshResult {
  isPulling: boolean
  pullDistance: number
  isRefreshing: boolean
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchMove: (e: React.TouchEvent) => void
    onTouchEnd: () => void
  }
}

export function usePullToRefresh(
  scrollContainerRef: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<void>
): PullToRefreshResult {
  const [isPulling, setIsPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const startYRef = useRef(0)
  const pullingRef = useRef(false)
  const pullDistanceRef = useRef(0)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = scrollContainerRef.current
    if (!el || el.scrollTop > 0 || isRefreshing) return
    startYRef.current = e.touches[0].clientY
    pullingRef.current = true
  }, [scrollContainerRef, isRefreshing])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pullingRef.current || isRefreshing) return
    const delta = e.touches[0].clientY - startYRef.current
    if (delta <= 0) {
      setIsPulling(false)
      setPullDistance(0)
      pullDistanceRef.current = 0
      return
    }
    const clamped = Math.min(delta * 0.5, MAX_PULL)
    pullDistanceRef.current = clamped
    setIsPulling(clamped > 10)
    setPullDistance(clamped)
  }, [isRefreshing])

  const onTouchEnd = useCallback(async () => {
    pullingRef.current = false
    const currentPull = pullDistanceRef.current
    if (currentPull >= PULL_THRESHOLD && !isRefreshing) {
      pullDistanceRef.current = 0
      setIsRefreshing(true)
      setPullDistance(0)
      setIsPulling(false)
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
      }
    } else {
      pullDistanceRef.current = 0
      setIsPulling(false)
      setPullDistance(0)
    }
  }, [isRefreshing, onRefresh])

  return {
    isPulling,
    pullDistance,
    isRefreshing,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  }
}
