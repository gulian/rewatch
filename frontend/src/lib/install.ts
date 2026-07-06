// PWA install helpers: platform detection + native install prompt capture.

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)

export const detectPlatform = (): 'ios' | 'android' | 'desktop' => {
  const ua = navigator.userAgent
  // iPadOS 13+ pretends to be macOS; the touch check catches it.
  if (/iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

// Chromium fires beforeinstallprompt once, early — capture it at module load
// (this module is in the main bundle) so the tutorial can offer a real
// one-tap install button. Safari/iOS never fires it.
type InstallPromptEvent = Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> }
let deferred: InstallPromptEvent | null = null
const readyListeners: Array<() => void> = []

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as InstallPromptEvent
  for (const l of readyListeners) l()
})

export const canPromptInstall = () => deferred !== null

export function onInstallPromptReady(listener: () => void): () => void {
  readyListeners.push(listener)
  return () => readyListeners.splice(readyListeners.indexOf(listener), 1)
}

/** Opens the browser's native install dialog. Resolves true when accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  deferred.prompt()
  const { outcome } = await deferred.userChoice
  if (outcome === 'accepted') deferred = null
  return outcome === 'accepted'
}
