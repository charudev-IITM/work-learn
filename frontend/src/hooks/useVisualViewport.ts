import { useState, useEffect } from 'react'

/**
 * Returns the visual viewport height in pixels, updating when the iOS
 * virtual keyboard opens/closes. Falls back to `null` (use CSS fallback).
 *
 * On iOS Safari, `100dvh` does NOT shrink when the keyboard appears.
 * The `window.visualViewport` API gives the actual visible area.
 */
export function useVisualViewport(): number | null {
  const [height, setHeight] = useState<number | null>(null)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return // Desktop or unsupported browser — use CSS fallback

    const update = () => {
      setHeight(vv.height)
    }

    // Set initial value
    update()

    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)

    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return height
}
