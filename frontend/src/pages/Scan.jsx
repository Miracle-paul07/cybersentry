import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CountUp, Magnetic, Reveal } from '../components/fx'
import ReportState from '../components/ReportState'
import { useJob } from '../JobContext'

// Small files finish all ML/DL stages in well under a second. Each stage is
// shown for at least this long so the tracker is readable; all numbers are real.
const MIN_STAGE_MS = 900
// Reports that finish this fast had no Groq wait, so go straight to the results.
// After a longer wait the user may be reading this page, so leave them on it.
const AUTO_OPEN_WITHIN_S = 5

const STAGES = [
  {
    key: 'preprocess',
    label: 'Preprocess',
    weight: 10,
    stats: (c) => [
      ['valid rows', c.rows_analysed],
      ['dropped', c.rows_dropped_invalid],
    ],
  },
  {
    key: 'ml',
    label: 'ML Anomaly Detection',
    weight: 30,
    stats: (c) => [
      ['flows scored', c.scored],
      ['suspicious', c.suspicious],
    ],
  },
  {
    key: 'dl',
    label: 'DL Classification',
    weight: 30,
    stats: (c) => [
      ['classified', c.classified],
      ['threats', c.threats],
    ],
  },
  {
    key: 'genai',
    label: 'GenAI Reports',
    weight: 30,
    stats: (c) => [
      ['reports written', c.reports_done],
      ['reports total', c.reports_total],
    ],
  },
]

export default function Scan() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { job, jobId: currentId, lostJob, pollError } = useJob()
  const [shown, setShown] = useState(0) // stages displayed as finished
  const lastAdvance = useRef(Date.now())

  const lost = lostJob === jobId

  const snap = job?.job_id === jobId ? job : null

  const realDone = snap ? STAGES.filter((s) => snap.stages[s.key].status === 'done').length : 0

  // Advance the displayed stage at most once per MIN_STAGE_MS
  useEffect(() => {
    if (shown >= realDone) return
    const wait = Math.max(0, MIN_STAGE_MS - (Date.now() - lastAdvance.current))
    const t = setTimeout(() => {
      lastAdvance.current = Date.now()
      setShown((n) => n + 1)
    }, wait)
    return () => clearTimeout(t)
  }, [shown, realDone])

  const finished = snap?.status === 'done' && shown === STAGES.length
  const fast = snap?.status === 'done' && snap.stages.genai.seconds < AUTO_OPEN_WITHIN_S
  const autoOpen = finished && fast
  useEffect(() => {
    if (!autoOpen) return
    const t = setTimeout(() => navigate('/overview'), 1100)
    return () => clearTimeout(t)
  }, [autoOpen, navigate])

  // ML + DL are done on screen too, so the results can be opened
  const resultsOpen = Boolean(snap?.results_ready) && shown >= 3
  const writing = resultsOpen && !finished && snap.counts.reports_total > 0

  const failed = snap?.status === 'error'
  const activeIndex = Math.min(shown, STAGES.length - 1)
  const percent = !snap
    ? 0
    : STAGES.reduce((sum, s, i) => {
        if (i < shown) return sum + s.weight
        if (i === shown && snap.stage === s.key) return sum + (s.weight * snap.stage_percent) / 100
        return sum
      }, 0)

  // A scan link from an earlier visit must not unlock the results again
  if (lost || jobId !== currentId) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16">
        <p role="alert" className="text-red-soft">
          {lost
            ? 'This analysis no longer exists. It may have been lost when the server restarted.'
            : 'This scan belongs to an earlier visit. Start a new scan to see results.'}
        </p>
        <Link to="/" className="mt-4 inline-block text-cyan underline">
          Back to upload
        </Link>
      </section>
    )
  }

  const stateOf = (s, i) => {
    if (failed && snap.stages[s.key].status === 'error') return 'error'
    if (i < shown) return 'done'
    if (i === activeIndex && snap && !failed) return 'active'
    return 'pending'
  }
  const c = snap?.counts
  const threatTypes = c ? Object.entries(c.threats_by_type).sort((a, b) => b[1] - a[1]) : []
  const headline = finished
    ? 'Analysis complete'
    : failed
      ? 'Analysis failed'
      : resultsOpen
        ? 'Detection complete, reports in progress'
        : 'Analysis in progress'

  return (
    <Reveal as="section" className="mx-auto max-w-5xl px-4 py-12">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="num text-xs tracking-widest text-cyan uppercase">{headline}</p>
          <h1 className="mt-2 font-display text-xl font-bold break-all sm:text-2xl">{snap?.filename ?? 'Starting…'}</h1>
        </div>
        <p className={`num text-5xl font-semibold sm:text-6xl ${failed ? 'text-red-soft' : 'text-cyan'}`}>
          {failed ? '!' : <CountUp value={percent} duration={0.4} format={(v) => `${Math.round(v)}%`} />}
        </p>
      </header>

      <div className="mt-6 h-1 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-all duration-500 ${failed ? 'bg-red' : 'bg-cyan shadow-[0_0_12px_rgb(34_211_238/0.8)]'}`}
          style={{ width: `${failed ? 100 : percent}%` }}
        />
      </div>

      <ol className="mt-10 grid gap-6 md:grid-cols-4 md:gap-0">
        {STAGES.map((s, i) => (
          <Stage key={s.key} stage={s} index={i} state={snap ? stateOf(s, i) : 'pending'} counts={c} seconds={snap?.stages[s.key].seconds} next={i < STAGES.length - 1 ? (snap ? stateOf(STAGES[i + 1], i + 1) : 'pending') : null} />
        ))}
      </ol>

      <p role="status" className="num mt-8 text-sm text-muted">
        {failed
          ? 'The pipeline stopped at the stage marked in red.'
          : snap?.stage === STAGES[activeIndex].key || finished
            ? snap?.message
            : `${STAGES[activeIndex].label}…`}
      </p>

      {pollError && (
        <p role="alert" className="mt-2 text-sm text-red-soft">
          {pollError} Retrying…
        </p>
      )}

      {resultsOpen && !fast && (
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Magnetic>
            <Link
              to="/overview"
              className="inline-block rounded-full border border-cyan/60 bg-cyan/10 px-6 py-2.5 text-sm font-semibold text-cyan transition hover:bg-cyan/20 hover:shadow-[0_0_24px_rgb(34_211_238/0.35)]"
            >
              View results
            </Link>
          </Magnetic>
          {writing && (
            <p className="min-w-0 flex-1 basis-64 text-sm text-muted">
              Detection is done. AI reports wait on the Groq free tier's rate limit and keep arriving in the background, so
              you don't need to stay on this page.
            </p>
          )}
        </div>
      )}

      {shown >= 3 && snap?.warnings?.map((w) => (
        <p key={w} className="mt-3 rounded-lg border border-amber/40 bg-amber/10 px-4 py-2 text-sm">
          {w}
        </p>
      ))}

      {failed && (
        <div role="alert" className="mt-6 rounded-xl border border-red/60 bg-panel p-4">
          <p className="text-red-soft">{snap.error}</p>
          <Link to="/" className="mt-3 inline-block text-cyan underline">
            Upload another file
          </Link>
        </div>
      )}

      {shown >= 2 && threatTypes.length > 0 && (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="glass rounded-xl p-5" data-threat>
            <h2 className="font-semibold">Threat feed</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {threatTypes.map(([type, count]) => (
                <li key={type} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-red shadow-[0_0_8px_var(--color-red)]" />
                  {type}
                  <span className="num ml-auto"><CountUp value={count} duration={0.5} /></span>
                </li>
              ))}
            </ul>
          </div>

          {shown >= 3 && (
            <div className="glass rounded-xl p-5">
              <h2 className="font-semibold">Incident reports</h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                {snap.reports.map((r) => (
                  <li key={r.attack_type} className={`flex items-center gap-2 ${r.status === 'queued' ? 'text-muted' : ''}`}>
                    {r.attack_type}
                    <ReportState report={r} className="ml-auto" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Reveal>
  )
}

function Stage({ stage, index, state, counts, seconds, next }) {
  const ring = {
    done: 'border-cyan bg-cyan text-ink shadow-[0_0_18px_rgb(34_211_238/0.55)]',
    active: 'border-cyan bg-cyan/15 text-cyan shadow-[0_0_24px_rgb(34_211_238/0.5)]',
    error: 'border-red bg-red text-white shadow-[0_0_22px_rgb(225_29_72/0.6)]',
    pending: 'border-line bg-panel text-muted',
  }[state]

  return (
    <li className="flex gap-4 md:block" aria-current={state === 'active' ? 'step' : undefined}>
      <div className="flex flex-col items-center md:flex-row">
        <span className={`num relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-500 ${ring}`}>
          {state === 'active' && <span className="absolute inset-0 animate-ping rounded-full border border-cyan/60" aria-hidden="true" />}
          {state === 'done' ? '✓' : state === 'error' ? '×' : `0${index + 1}`}
        </span>
        {next !== null && (
          <span className="relative min-h-6 w-0.5 flex-1 overflow-hidden bg-line md:h-0.5 md:min-h-0 md:w-auto" aria-hidden="true">
            {state === 'done' && <span className="absolute inset-0 bg-cyan" />}
            {state === 'active' && <span className="stream absolute inset-0" />}
          </span>
        )}
      </div>

      <div className="min-w-0 pb-2 md:mt-4 md:pr-5">
        <h2 className={`font-semibold transition-colors ${state === 'pending' ? 'text-muted' : ''}`}>{stage.label}</h2>
        <dl className="mt-2 space-y-1 text-xs">
          {stage.stats(counts ?? {}).map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-2">
              <dd className={`num text-base ${state === 'pending' ? 'text-muted' : ''}`}>
                {state === 'pending' ? '—' : <CountUp value={value ?? 0} duration={0.6} />}
              </dd>
              <dt className="text-muted">{label}</dt>
            </div>
          ))}
        </dl>
        <p className="num mt-1 h-4 text-xs text-muted">{state === 'done' && seconds != null ? `${seconds.toFixed(2)}s` : ''}</p>
      </div>
    </li>
  )
}
