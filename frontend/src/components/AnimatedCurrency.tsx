'use client'

import { formatCurrency } from '@/lib/utils'
import { useAnimatedNumber } from '@/lib/useAnimatedNumber'

interface AnimatedCurrencyProps {
  value: number
  className?: string
}

export default function AnimatedCurrency({ value, className = '' }: AnimatedCurrencyProps) {
  const animatedValue = useAnimatedNumber(value)
  return <span className={className}>{formatCurrency(animatedValue)}</span>
}
