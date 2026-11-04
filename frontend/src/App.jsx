import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import Footer from './components/Footer'
import { Cursor, SmoothScroll, reducedMotion, scrollToTop } from './components/fx'
import Locked from './components/Locked'
import Nav from './components/Nav'
import Shutter from './components/Shutter'
import { Loading } from './components/ui'
import { useJob } from './JobContext'
import Landing from './pages/Landing'
import Scan from './pages/Scan'

// Result pages load on demand, so the charting library isn't on the landing page
const Overview = lazy(() => import('./pages/Overview'))
const Detection = lazy(() => import('./pages/Detection'))
const Analysis = lazy(() => import('./pages/Analysis'))
const Reports = lazy(() => import('./pages/Reports'))
const Evaluation = lazy(() => import('./pages/Evaluation'))

const preloadPages = () =>
  Promise.all([
    import('./pages/Overview'),
    import('./pages/Detection'),
    import('./pages/Analysis'),
    import('./pages/Reports'),
    import('./pages/Evaluation'),
  ]).catch(() => {}) // a failed preload just means the page loads when it is opened

// /reports/DDoS -> /reports/Bot stays on the same page, so no transition
const pageOf = (location) => location.pathname.split('/')[1] || 'home'

export default function App() {
  const location = useLocation()
  const { jobId } = useJob()
  const shutter = useRef(null)
  const latest = useRef(location)
  latest.current = location
  // The page on screen stays put while the wipe covers it, then swaps behind the wipe. It keeps
  // its own latest address until then: an older one could set off that page's redirect, and
  // the redirect would cancel the click that started the wipe.
  const [shownPage, setShownPage] = useState(() => pageOf(location))
  const pageKey = pageOf(location)
  const displayedRef = useRef(location)
  if (pageKey === shownPage) displayedRef.current = location
  const displayed = displayedRef.current

  useEffect(() => {
    if (pageKey === shownPage) return
    const swap = () => {
      setShownPage(pageOf(latest.current))
      scrollToTop()
    }
    if (reducedMotion()) swap()
    else shutter.current.cover(pageKey, swap)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey])

  // Results open behind a wipe, so have them ready instead of showing "Loading…" after it
  useEffect(() => {
    if (jobId) preloadPages()
  }, [jobId])

  return (
    <div className="flex min-h-screen flex-col">
      <div className="app-bg" aria-hidden="true" />
      <SmoothScroll />
      <Cursor />
      <Nav />

      <main className="flex-1">
        <div key={shownPage}>
          <Suspense fallback={<Loading />}>
            <Routes location={displayed}>
              <Route path="/" element={<Landing />} />
              <Route path="/scan/:jobId" element={<Scan />} />
              <Route path="/overview" element={<Locked><Overview /></Locked>} />
              <Route path="/detection" element={<Locked><Detection /></Locked>} />
              <Route path="/analysis/:type?" element={<Locked><Analysis /></Locked>} />
              <Route path="/reports/:type?" element={<Locked><Reports /></Locked>} />
              <Route path="/evaluation" element={<Locked><Evaluation /></Locked>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
      </main>
      <Footer />
      <Shutter ref={shutter} />
    </div>
  )
}
