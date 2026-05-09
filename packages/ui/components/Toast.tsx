'use client'
import { useEffect } from 'react'
import { clsx } from 'clsx'

interface ToastProps {
  message: string
  type?: 'ok' | 'err' | 'info'
  onDismiss: () => void
  duration?: number
}

export default function Toast({ message, type = 'ok', onDismiss, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, duration)
    return () => clearTimeout(t)
  }, [onDismiss, duration])

  return (
    <div
      className={clsx(
        'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg animate-fadein',
        type === 'ok'  && 'bg-green-900 text-green border border-green/30',
        type === 'err' && 'bg-rose-950  text-rose  border border-rose/30',
        type === 'info'&& 'bg-paper2    text-ink   border border-border',
      )}
    >
      {message}
    </div>
  )
}
