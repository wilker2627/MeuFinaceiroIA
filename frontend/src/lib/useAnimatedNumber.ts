'use client'

import { useEffect, useRef, useState } from 'react'

interface UseAnimatedNumberOptions {
  durationMs?: number
}

export function useAnimatedNumber(value: number, options?: UseAnimatedNumberOptions) {
  const durationMs = options?.durationMs ?? 900
  const [animatedValue, setAnimatedValue] = useState(value)
  const previousValueRef = useRef(value)

  useEffect(() => {
    if (!Number.isFinite(value)) {
      setAnimatedValue(value)
      previousValueRef.current = value
      return
    }

    if (typeof window === 'undefined') {
      setAnimatedValue(value)
      previousValueRef.current = value
      return
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setAnimatedValue(value)
      previousValueRef.current = value
      return
    }

    const start = previousValueRef.current
    const delta = value - start
    if (delta === 0) {
      setAnimatedValue(value)
      return
    }

    const startTime = performance.now()
    let rafId = 0

    const tick = (currentTime: number) => {
      const progress = Math.min((currentTime - startTime) / durationMs, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimatedValue(start + delta * eased)

      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick)
      } else {
        previousValueRef.current = value
      }
    }

    rafId = window.requestAnimationFrame(tick)

    return () => window.cancelAnimationFrame(rafId)
  }, [value, durationMs])

  return animatedValue
}
