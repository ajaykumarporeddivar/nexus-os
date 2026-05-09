'use client'
import { clsx } from 'clsx'

type DotVariant = 'ok' | 'warn' | 'err' | 'idle'

export default function StatusDot({ variant = 'idle' }: { variant?: DotVariant }) {
  return <span className={clsx('status-dot', `sd-${variant}`)} />
}
