import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMe, useStats } from '../api/hooks'
import { minutesToDaysHours } from '../lib/format'
import PushPrompt from './PushPrompt'
import { LENS_BACKDROP, LiquidGlassFilter, useLensSupport } from './LiquidGlass'

// Nav icons — SVG paths from the design.
const TABS = [
  { to: '/', key: 'nav.upnext', d: 'M8 5v14l11-7z', fill: true },
  { to: '/calendar', key: 'nav.calendar', d: 'M4 6h16v14H4z M4 10.5h16 M8 3v5 M16 3v5', fill: false },
  { to: '/search', key: 'nav.search', d: 'M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12z M14.5 14.5L20 20', fill: false },
  { to: '/stats', key: 'nav.stats', d: 'M5 20v-8 M12 20V6 M19 20v-5', fill: false },
  { to: '/profile', key: 'nav.profile', d: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z M4 21c1.5-4 5-5.5 8-5.5s6.5 1.5 8 5.5', fill: false },
]

function TabIcon({ d, fill, active, size = 22 }: { d: string; fill: boolean; active: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        d={d}
        fill={fill ? 'currentColor' : 'none'}
        stroke={fill ? 'none' : 'currentColor'}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={active || fill ? 1 : undefined}
      />
    </svg>
  )
}

export default function Layout() {
  const { t } = useTranslation()
  const { data: me } = useMe()
  const { data: stats } = useStats()
  const lens = useLensSupport()
  const location = useLocation()

  // Tapping the tab of the section already on screen scrolls it back to top.
  const onTabClick = (to: string) => {
    if (location.pathname === to) window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar (design 6a) */}
      <aside className="bg-navbg fixed inset-y-0 left-0 z-20 hidden w-[232px] flex-col border-r border-line lg:flex px-3.5 py-5.5">
        <div className="flex items-center gap-2.5 px-2.5 pb-6">
          <div className="bg-accent text-ink flex h-8.5 w-8.5 items-center justify-center rounded-[10px] text-[17px] font-extrabold">
            ✓
          </div>
          <div className="text-[19px] font-extrabold tracking-tight">Rewatch</div>
        </div>
        <nav className="flex flex-col gap-1">
          {TABS.map((tab) => (
            <NavLink
              viewTransition
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              onClick={() => onTabClick(tab.to)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-[11px] px-3 py-2.75 text-sm ${
                  isActive ? 'text-accent bg-accent/10 font-bold' : 'text-navmut font-medium'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <TabIcon d={tab.d} fill={tab.fill} active={isActive} size={20} />
                  <span>{t(tab.key)}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="bg-userbg mt-auto flex items-center gap-2.5 rounded-[11px] px-3 py-2.5">
          <div className="bg-accent text-ink flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold">
            {me?.username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-bold">{me?.username}</div>
            <div className="text-dim text-[11px] font-semibold">
              {stats ? t('profile.watchTime', { time: minutesToDaysHours(stats.totalMinutes) }) : '…'}
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-28 pt-[env(safe-area-inset-top)] lg:ml-[232px] lg:pb-8">
        <Outlet />
      </main>

      <PushPrompt />

      <LiquidGlassFilter />

      {/* Mobile tab bar — floating glass capsule, content scrolls underneath.
          Chromium gets true edge refraction (SVG displacement map); others
          keep the plain blur fallback. */}
      <nav
        style={lens ? { backdropFilter: LENS_BACKDROP, WebkitBackdropFilter: LENS_BACKDROP } : undefined}
        className={`fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 flex gap-1 rounded-[30px] border border-white/12 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_10px_40px_rgba(0,0,0,.55)] lg:hidden ${
          lens ? 'bg-[rgba(13,19,34,.38)]' : 'bg-[rgba(13,19,34,.55)] backdrop-blur-2xl backdrop-saturate-150'
        }`}
      >
        {TABS.map((tab) => (
          <NavLink
            viewTransition
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            onClick={() => onTabClick(tab.to)}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 rounded-[22px] py-1.5 transition-colors duration-200 ${
                isActive ? 'text-accent bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,.1)]' : 'text-navmut'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <TabIcon d={tab.d} fill={tab.fill} active={isActive} />
                <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>{t(tab.key)}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
