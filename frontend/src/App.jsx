import { Suspense, lazy, useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import Footer from './components/Footer'
import { Cursor, SmoothScroll, reducedMotion, scrollToTop } from './components/fx'
import Locked from './components/Locked'
import Nav from './components/Nav'
import { Loading } from './components/ui'
import Landing from './pages/Landing'
import Scan from './pages/Scan'

// Result pages load on demand, so the charting library isn't on the landing page
const Overview = lazy(() => import('./pages/Overview'))
const Detection = lazy(() => import('./pages/Detection'))
const Analysis = lazy(() => import('./pages/Analysis'))
const Reports = lazy(() => import('./pages/Reports'))

export default function App() {
  const location = useLocation()
  // /reports/DDoS -> /reports/Bot stays on the same page, so no transition
  const pageKey = location.pathname.split('/')[1] || 'home'
  const still = reducedMotion()

  useEffect(() => {
    scrollToTop()
  }, [pageKey])

  return (
    <div className="flex min-h-screen flex-col">
      <div className="app-bg" aria-hidden="true" />
      <SmoothScroll />
      <Cursor />
      <Nav />

      {/* A thin scan line crosses the screen on each page change */}
      {!still && pageKey !== 'home' && (
        <motion.div
          key={`scanline-${pageKey}`}
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-px bg-cyan shadow-[0_0_16px_3px_rgb(34_211_238/0.6)]"
          initial={{ y: 0, opacity: 1 }}
          animate={{ y: '100vh', opacity: 0 }}
          transition={{ duration: 0.65, ease: 'easeInOut' }}
        />
      )}

      <main className="flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pageKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: still ? 0 : 0.18 }}
          >
            <Suspense fallback={<Loading />}>
              <Routes location={location}>
                <Route path="/" element={<Landing />} />
                <Route path="/scan/:jobId" element={<Scan />} />
                <Route path="/overview" element={<Locked><Overview /></Locked>} />
                <Route path="/detection" element={<Locked><Detection /></Locked>} />
                <Route path="/analysis/:type?" element={<Locked><Analysis /></Locked>} />
                <Route path="/reports/:type?" element={<Locked><Reports /></Locked>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
      <Footer />
    </div>
  )
}
