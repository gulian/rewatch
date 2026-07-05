// Tiny vibration on check (Android — silent no-op elsewhere, iOS doesn't expose it).
export function buzz(pattern: number | number[] = 10) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* no-op */
  }
}
