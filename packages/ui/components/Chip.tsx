'use client'
import { clsx } from 'clsx'

type ChipVariant = 'default' | 'ok' | 'warn' | 'err' | 'acid' | 'violet'

interface ChipProps {
  children: React.ReactNode
  variant?: ChipVariant
  className?: string
}

export default function Chip({ children, variant = 'default', className }: ChipProps) {
  return (
    <span className={clsx('chip', variant !== 'default' && variant, className)}>
      {children}
    </span>
  )
}
