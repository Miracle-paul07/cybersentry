import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { Magnetic, reducedMotion } from '../components/fx'
import { useJob } from '../JobContext'

// three.js is large, so the upload page appears first and the network fades in after
const NetworkScene = lazy(() => import('../components/NetworkScene'))

const MAX_MB = 20
const TITLE = 'CyberSentry'
const TAGLINE = ['Detect.', 'Understand.', 'Respond.']

export default function Landing() {
  const navigate = useNavigate()
  const { setJobId } = useJob()
  const root = useRef(null)
  const input = useRef(null)
  const [health, setHealth] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // The server may still be loading the models; keep trying quietly
  useEffect(() => {
    let timer
    const check = () =>
      api
        .health()
        .then(setHealth)
        .catch(() => {
          timer = setTimeout(check, 2000)
        })
    check()
    return () => clearTimeout(timer)
  }, [])

  // The one big moment: title rises letter by letter, tagline word by word
  useLayoutEffect(() => {
    if (reducedMotion()) return
    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.hero-char', { yPercent: 115, duration: 0.9, stagger: 0.04 })
        .from('.hero-word', { opacity: 0, y: 12, filter: 'blur(8px)', duration: 0.6, stagger: 0.3, clearProps: 'filter' }, '-=0.35')
        .from('.hero-rest', { opacity: 0, y: 18, duration: 0.6, stagger: 0.1, clearProps: 'opacity,transform' }, '-=0.3')
    }, root)
    return () => ctx.revert()
  }, [])

  async function start(request) {
    setBusy(true)
    setError(null)
    try {
      const { job_id } = await request()
      setJobId(job_id)
      navigate(`/scan/${job_id}`)
    } catch (e) {
      setError({ message: e.message, missing: e.detail?.missing_columns })
      setBusy(false)
    }
  }

  function upload(file) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError({ message: 'Please upload a .csv file.' })
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError({ message: `File is too large. Please upload a file under ${MAX_MB} MB.` })
      return
    }
    start(() => api.analyze(file))
  }

  return (
    <section ref={root} className="relative">
      <div className="fixed inset-0 z-0" aria-hidden="true">
        <Suspense fallback={null}>
          <NetworkScene />
        </Suspense>
        {/* Darkens the middle of the network so the text stays readable */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(5_7_15/0.82)_0%,rgb(5_7_15/0.45)_42%,transparent_72%)]" />
      </div>

      <div data-cursor="UPLOAD TO BEGIN" className="relative z-10 flex min-h-[calc(100svh-57px)] flex-col items-center justify-center px-4 py-10 text-center">
        <p className="hero-rest num text-xs tracking-[0.3em] text-cyan uppercase">Network threat analysis</p>

        <h1
          aria-label={TITLE}
          className="mt-4 flex overflow-hidden py-1 font-display text-[clamp(2rem,9.5vw,6.5rem)] leading-tight font-extrabold tracking-tight"
        >
          {[...TITLE].map((c, i) => (
            <span key={i} aria-hidden="true" className={`hero-char inline-block ${i >= 5 ? 'text-cyan' : ''}`}>
              {c}
            </span>
          ))}
        </h1>

        <p className="mt-2 text-lg font-medium sm:text-2xl">
          {TAGLINE.map((w) => (
            <span key={w} className="hero-word mx-1.5 inline-block">
              {w}
            </span>
          ))}
        </p>

        <div
          role="button"
          tabIndex={0}
          aria-disabled={busy}
          aria-label="Upload a CSV file of network flows"
          data-cursor="DROP CSV"
          data-dragging={dragging}
          onClick={() => !busy && input.current.click()}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !busy) {
              e.preventDefault()
              input.current.click()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (!busy) upload(e.dataTransfer.files[0])
          }}
          className={`hero-rest dropzone glass mt-10 w-full max-w-xl cursor-pointer rounded-2xl border-dashed p-8 sm:p-10 ${busy ? 'opacity-50' : ''}`}
        >
          <svg viewBox="0 0 24 24" className="mx-auto h-8 w-8 text-cyan" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M12 16V5m0 0L7.5 9.5M12 5l4.5 4.5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="mt-3 text-lg font-semibold">{busy ? 'Uploading…' : 'Drop a network flow CSV here'}</p>
          <p className="mt-1 text-sm text-muted">or click to browse · CICFlowMeter format · up to {MAX_MB} MB</p>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              upload(e.target.files[0])
              e.target.value = ''
            }}
          />
        </div>

        <div className="hero-rest mt-6">
          <Magnetic>
            <button
              type="button"
              disabled={busy}
              onClick={() => start(api.analyzeSample)}
              className="rounded-full border border-cyan/60 bg-cyan/10 px-6 py-2.5 text-sm font-semibold text-cyan transition hover:bg-cyan/20 hover:shadow-[0_0_24px_rgb(34_211_238/0.35)] disabled:opacity-50"
            >
              Try the demo dataset
            </button>
          </Magnetic>
        </div>

        <p className="hero-rest num mt-5 min-h-5 text-xs text-muted">
          {!health && 'Connecting to the detection engine…'}
          {health && (
            <>
              {health.models.stage1} + {health.models.stage2} ·{' '}
              {health.groq.reachable ? (
                <span className="text-cyan">AI reports: Groq online</span>
              ) : (
                <span className="text-amber">AI reports: template mode</span>
              )}
            </>
          )}
        </p>

        {error && (
          <div role="alert" className="mt-6 w-full max-w-xl rounded-xl border border-red/60 bg-panel p-4 text-left text-sm">
            <p className="font-medium text-red-soft">{error.message}</p>
            {error.missing?.length > 0 && (
              <p className="num mt-2 max-h-28 overflow-y-auto text-xs text-muted">Missing: {error.missing.join(', ')}</p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
