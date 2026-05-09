'use client'
import { clsx } from 'clsx'

interface CardProps {
  children: React.ReactNode
  variant?: 'card' | 'panel' | 'kpi'
  className?: string
}

export default function Card({ children, variant = 'card', className }: CardProps) {
  const cls = variant === 'kpi' ? 'kpi-card' : variant
  return (
    <div className={clsx(cls, className)}>
      {children}
    </div>
  )
}
