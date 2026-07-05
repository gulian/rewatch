import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useMe } from './api/hooks'
import i18n from './i18n'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import Admin from './screens/Admin'
import { Setup } from './screens/OpsSettings'
import Calendar from './screens/Calendar'
import Login from './screens/Login'
import { Reset, Verify } from './screens/TokenPages'
import VerifyGate from './screens/VerifyGate'
import MovieDetail from './screens/MovieDetail'
import Profile from './screens/Profile'
import Resolve from './screens/Resolve'
import Search from './screens/Search'
import ShowDetail from './screens/ShowDetail'
import Stats from './screens/Stats'
import TvTimeHelp from './screens/TvTimeHelp'
import UpNext from './screens/UpNext'

// The account language wins over the browser language once /me is known.
function LanguageSync() {
  const { data: me } = useMe()
  useEffect(() => {
    const lang = me?.language === 'fr' ? 'fr' : me ? 'en' : null
    if (lang && i18n.language !== lang) void i18n.changeLanguage(lang)
    document.documentElement.lang = i18n.language
  }, [me])
  return null
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = useMe()
  const location = useLocation()
  if (isLoading) return <Spinner />
  if (isError || !data) return <Navigate to="/login" replace state={{ from: location }} />
  if (data.blocked) return <VerifyGate me={data} />
  return children
}

export default function App() {
  return (
    <>
      <LanguageSync />
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/verify" element={<Verify />} />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <Admin />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/setup"
        element={
          <RequireAuth>
            <Setup />
          </RequireAuth>
        }
      />
      <Route path="/reset" element={<Reset />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<UpNext />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/search" element={<Search />} />
        <Route path="/show/:id" element={<ShowDetail />} />
        <Route path="/movie/:id" element={<MovieDetail />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/import/tvtime" element={<TvTimeHelp />} />
        <Route path="/resolve" element={<Resolve />} />
      </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
