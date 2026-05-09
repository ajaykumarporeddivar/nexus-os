'use client'
import { useEffect, useState } from 'react'

export default function ScoreBar({ value }: { value: number }) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setWidth(value), 100)
    return () => clearTimeout(t)
  }, [value])

  return (
    <div className="score-bar-wrap">
      <div className="score-bar-fill" style={{ width: `${width}%` }} />
    </div>
  )
}
