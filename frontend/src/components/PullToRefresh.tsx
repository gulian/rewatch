// Custom pull-to-refresh for the installed PWA: standalone mode has no
// browser chrome, so the native gesture doesn't exist there. Indicator-only
// (the content never moves), passive listeners — no scroll hijacking.
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isStandalone } from '../lib/install'

const TRIGGER = 60 // px of (dampened) pull that arms the refresh

export default function PullToRefresh() {
  const qc = useQueryClient()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!isStandalone()) return
    let startY = 0
    let pulling = false

    const onStart = (e: TouchEvent) => {
      pulling = window.scrollY <= 0
      if (pulling) startY = e.touches[0].clientY
    }
    const onMove = (e: TouchEvent) => {
      if (!pulling || refreshing) return
      const dy = (e.touches[0].clientY - startY) * 0.4 // resistance
      setPull(dy > 0 && window.scrollY <= 0 ? Math.min(TRIGGER * 1.4, dy) : 0)
    }
    const onEnd = () => {
      if (!pulling) return
      pulling = false
      setPull((current) => {
        if (current >= TRIGGER && !refreshing) {
          setRefreshing(true)
          // Refetch everything; keep the spinner visible long enough to read.
          void Promise.all([qc.invalidateQueries(), new Promise((r) => setTimeout(r, 700))]).finally(() => {
            setRefreshing(false)
            setPull(0)
          })
          return TRIGGER
        }
        return 0
      })
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [qc, refreshing])

  if (pull === 0 && !refreshing) return null
  const progress = Math.min(1, pull / TRIGGER)
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
      style={{ top: `calc(env(safe-area-inset-top) + ${8 + progress * 34}px)`, opacity: 0.3 + progress * 0.7 }}
    >
      <div className="bg-card flex h-9 w-9 items-center justify-center rounded-full border border-line shadow-[0_6px_20px_rgba(0,0,0,.45)]">
        <span
          className={`border-accent inline-block h-4.5 w-4.5 rounded-full border-2 border-t-transparent ${refreshing ? 'animate-spin' : ''}`}
          style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
        />
      </div>
    </div>
  )
}
