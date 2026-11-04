import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { Magnetic, afterIntro, glideTo, reducedMotion } from '../components/fx'
import Pipeline from '../components/Pipeline'
import Planet from '../components/Planet'
import { useJob } from '../JobContext'

const MAX_MB = 20
const TITLE = 'CyberSentry'
const TAGLINE = ['Detect.', 'Understand.', 'Respond.']
const MARQUEE = ['Detect', 'Understand', 'Respond']
const MAX_TITLE_HEIGHT = 0.34 // of the screen, so short screens still fit the upload box
// Hidden for the live demo, where files are uploaded by hand. The endpoint is still there.
const SHOW_DEMO_BUTTON = false

function StatusCell({ label, children }) {
  return (
    <div className="border-line/70 px-6 py-3 md:border-r md:last:border-r-0">
      <dt className="text-muted/70">{label}</dt>
      <dd className="mt-0.5 text-text">{children}</dd>
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const { setJobId } = useJob()
  const root = useRef(null)
  const input = useRef(null)
  const title = useRef(null)
  const pipeline = useRef(null)
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

  // The title runs the full width of the screen, whatever the font's width turns out to be
  useLayoutEffect(() => {
    const node = title.current
    const fit = () => {
      node.style.fontSize = '100px'
      const width = node.scrollWidth
      const room = node.parentElement.clientWidth - 48
      node.style.fontSize = `${Math.min((100 * room) / width, window.innerHeight * MAX_TITLE_HEIGHT)}px`
    }
    fit()
    document.fonts?.ready.then(fit)
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  // The one big moment: the title rises letter by letter, then the tagline line by line
  useLayoutEffect(() => {
    if (reducedMotion()) return
    let timeline
    const ctx = gsap.context(() => {
      timeline = gsap
        .timeline({ paused: true, defaults: { ease: 'power4.out' } })
        .from('.hero-char', { yPercent: 110, duration: 1.1, stagger: 0.035 })
        .from('.hero-line', { yPercent: 110, duration: 0.9, stagger: 0.09 }, 0.25)
        .from('.hero-rest', { opacity: 0, y: 16, duration: 0.7, stagger: 0.08, clearProps: 'opacity,transform' }, 0.5)
    }, root)
    afterIntro(() => timeline.play())
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
      <Planet />

      <div data-cursor="UPLOAD TO BEGIN" className="relative z-10 flex min-h-[calc(100svh-49px)] flex-col overflow-hidden">
        <dl className="hero-rest num grid grid-cols-2 border-b border-line/70 bg-ink/60 text-[11px] tracking-[0.14em] uppercase md:grid-cols-4">
          <StatusCell label="[ 00 ]">Network threat analysis</StatusCell>
          <StatusCell label="Detection">{health ? `${health.models.stage1} + ${health.models.stage2}` : 'Connecting…'}</StatusCell>
          <StatusCell label="AI reports">
            {!health && 'Connecting…'}
            {health && (health.groq.reachable ? <span className="text-cyan">Groq online</span> : <span className="text-amber">Template mode</span>)}
          </StatusCell>
          <StatusCell label="Input">CICFlowMeter CSV · {MAX_MB} MB max</StatusCell>
        </dl>

        <div className="grid flex-1 items-center gap-8 px-6 py-8 lg:grid-cols-12">
          <div className="lg:col-span-6">
            {TAGLINE.map((line, i) => (
              <p key={line} className="overflow-hidden">
                <span className={`hero-line block font-display text-[clamp(3rem,8.4vw,9rem)] leading-[0.92] font-medium uppercase ${i === 2 ? 'text-cyan' : ''}`}>
                  {line}
                </span>
              </p>
            ))}
            <button
              type="button"
              data-cursor="SCROLL"
              onClick={() => glideTo(pipeline.current)}
              className="hero-rest num mt-8 flex items-center gap-3 text-[11px] tracking-[0.25em] text-muted uppercase transition-colors hover:text-cyan"
            >
              <span className="scroll-cue" aria-hidden="true" />
              Scroll to follow the pipeline
            </button>
          </div>

          <div className="hero-rest lg:col-span-4 lg:col-start-9">
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
              className={`dropzone ticks cursor-pointer p-7 ${busy ? 'opacity-50' : ''}`}
            >
              <p className="num text-[11px] tracking-[0.2em] text-cyan uppercase">[ Start a scan ]</p>
              <p className="mt-5 font-display text-5xl leading-none font-bold uppercase">{busy ? 'Uploading…' : 'Drop a flow CSV'}</p>
              <p className="mt-4 text-sm text-muted">or click to browse. Uses the CICFlowMeter format, with 2017 or 2018 column names.</p>
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

            {SHOW_DEMO_BUTTON && (
              <div className="mt-4">
                <Magnetic>
                  <button type="button" disabled={busy} onClick={() => start(api.analyzeSample)} className="btn">
                    Try the demo dataset
                  </button>
                </Magnetic>
              </div>
            )}

            {error && (
              <div role="alert" className="mt-4 border border-red/60 bg-panel p-4 text-left text-sm">
                <p className="font-medium text-red-soft">{error.message}</p>
                {error.missing?.length > 0 && (
                  <p className="num mt-2 max-h-28 overflow-y-auto text-xs text-muted">Missing: {error.missing.join(', ')}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center overflow-hidden px-6 pb-2">
          <h1 ref={title} aria-label={TITLE} className="flex w-max font-display leading-[0.8] font-extrabold uppercase">
            {[...TITLE].map((c, i) => (
              <span key={i} aria-hidden="true" className={`hero-char inline-block ${i >= 5 ? 'text-cyan' : ''}`}>
                {c}
              </span>
            ))}
          </h1>
        </div>
      </div>

      <div className="marquee relative z-10" aria-hidden="true">
        {[0, 1].map((copy) => (
          <div key={copy} className="marquee-track">
            {[...MARQUEE, ...MARQUEE].map((word, i) => (
              <span key={i} className="marquee-word">
                {word}
                <span className="marquee-mark">+</span>
              </span>
            ))}
          </div>
        ))}
      </div>

      <div ref={pipeline} className="relative z-10">
        <Pipeline />
      </div>
    </section>
  )
}
