// Real "liquid glass" edge refraction via an SVG displacement map applied
// with `backdrop-filter: url(#…)`. Chromium only — Safari/Firefox ignore
// SVG filters in backdrop-filter, so callers keep a plain blur fallback.
// Technique popularized by liquid-glass.maxrovensky.com.
import { useEffect, useState } from 'react'

// Displacement map for a rounded capsule: red channel = X offset, green = Y.
// Full-ramp gradients on the edge band, neutral gray (no displacement) in the
// center — blurred so the lens fades smoothly into flat glass.
const MAP_W = 352
const MAP_H = 60
const RADIUS = 30
const BAND = 16

const mapSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_W}" height="${MAP_H}">
  <defs>
    <linearGradient id="rx" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#f00"/>
    </linearGradient>
    <linearGradient id="gy" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#0f0"/>
    </linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="9"/></filter>
  </defs>
  <rect width="${MAP_W}" height="${MAP_H}" fill="#000"/>
  <rect width="${MAP_W}" height="${MAP_H}" rx="${RADIUS}" fill="url(#rx)"/>
  <rect width="${MAP_W}" height="${MAP_H}" rx="${RADIUS}" fill="url(#gy)" style="mix-blend-mode:screen"/>
  <rect x="${BAND}" y="${BAND}" width="${MAP_W - 2 * BAND}" height="${MAP_H - 2 * BAND}" rx="${RADIUS - BAND / 2}" fill="#808080" filter="url(#soft)"/>
</svg>`

const mapUri = `data:image/svg+xml,${encodeURIComponent(mapSvg)}`

/** True on Chromium — the only engine that applies SVG filters in backdrop-filter. */
export function useLensSupport() {
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    setSupported('chrome' in window)
  }, [])
  return supported
}

export const LENS_BACKDROP = 'url(#liquid-lens) blur(3px) saturate(1.6)'

/** Hidden filter definition — mount once (Layout). */
export function LiquidGlassFilter() {
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute' }}>
      <filter id="liquid-lens" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feImage href={mapUri} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
        {/* Negative scale samples outward near edges → magnifying lens look. */}
        <feDisplacementMap in="SourceGraphic" in2="map" scale="-120" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}
