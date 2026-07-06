// Theme preference: dark (default, the original design), light, or system.
// Per device (localStorage), applied before React renders (see index.html).

export type ThemePref = 'dark' | 'light' | 'system'

const KEY = 'rewatch-theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

export const getThemePref = (): ThemePref => {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'system' ? v : 'dark'
}

function apply(pref: ThemePref) {
  const dark = pref === 'system' ? media.matches : pref === 'dark'
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0b1220' : '#f5f3ed')
}

export function setThemePref(pref: ThemePref) {
  localStorage.setItem(KEY, pref)
  apply(pref)
}

// Follow the OS live while in system mode.
media.addEventListener('change', () => {
  if (getThemePref() === 'system') apply('system')
})

// Sync the meta tag with whatever the boot script decided.
apply(getThemePref())
