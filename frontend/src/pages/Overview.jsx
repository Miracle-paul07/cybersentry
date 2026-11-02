import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useNavigate } from 'react-router'
import { api } from '../api'
import EChart from '../components/EChart'
import { CountUp, Reveal, reducedMotion } from '../components/fx'
import { attackBars, histogramColumns, riskDonut } from '../components/chartOptions'
import { ErrorNote, Loading, PageHeader, Panel, Stat, Warnings } from '../components/ui'
import { useJob } from '../JobContext'
import { RISK_COLORS, RISK_LEVELS, fmt } from '../risk'

export default function Overview() {
  const { jobId } = useJob()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.results(jobId, { size: 1 }).then(setData).catch((e) => setError(e.message))
  }, [jobId])

  const donut = useMemo(() => data && riskDonut(data.risk_counts), [data])
  const bars = useMemo(() => data && attackBars(data.attack_counts), [data])
  const confidence = useMemo(
    () =>
      data?.confidence_histogram &&
      histogramColumns(data.confidence_histogram, { axisName: 'Model confidence' }),
    [data],
  )

  // Clicking a bar or its label opens that attack's flows
  const openAttack = useCallback(
    (p) => {
      const type = p.componentType === 'yAxis' ? p.value : p.name
      if (type) navigate(`/detection?attack_type=${encodeURIComponent(type)}`)
    },
    [navigate],
  )

  if (error) return <div className="mx-auto max-w-6xl px-4 py-12"><ErrorNote>{error}</ErrorNote></div>
  if (!data) return <Loading />

  const k = data.kpis
  const threats = k.threats > 0

  return (
    <>
    {threats && <ScanWave jobId={jobId} />}
    <Reveal as="section" className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader eyebrow={`Security overview · ${data.filename}`} title="Network status" />

      <div
        role="status"
        data-threat={threats || undefined}
        className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border p-4 ${
          threats ? 'pulse-red border-red/60 bg-red/10' : 'border-cyan/50 bg-cyan/10 shadow-[0_0_24px_rgb(34_211_238/0.12)]'
        }`}
      >
        <span className={`h-3 w-3 rounded-full ${threats ? 'animate-pulse bg-red shadow-[0_0_12px_var(--color-red)]' : 'bg-cyan shadow-[0_0_12px_var(--color-cyan)]'}`} />
        <div>
          <p className="font-display text-lg font-bold">{threats ? 'Threats detected' : 'All clear'}</p>
          <p className="text-sm text-muted">
            {threats
              ? `${fmt(k.threats)} flows classified as malicious, across ${k.attack_types} attack type${k.attack_types === 1 ? '' : 's'}.`
              : 'No malicious flows were found in this file.'}
          </p>
        </div>
      </div>

      <Warnings items={data.warnings} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total flows" value={k.total_flows} />
        <Stat label="Threats" value={k.threats} tone={threats ? 'text-red-soft' : 'text-text'} />
        <Stat label="Threat share" value={k.threat_pct} format={(v) => `${v.toFixed(1)}%`} />
        <Stat label="Needs review" value={k.needs_review} tone={k.needs_review ? 'text-amber' : 'text-text'} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Panel title="Risk breakdown" note="Every analysed flow, by risk level." className="lg:col-span-2">
          <div className="relative">
            <EChart option={donut} height={220} label="Donut chart of flows by risk level" />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="num text-2xl font-semibold"><CountUp value={k.total_flows} /></span>
              <span className="text-xs text-muted">flows</span>
            </div>
          </div>
          <ul className="mt-4 space-y-1.5">
            {RISK_LEVELS.map((level) => {
              const n = data.risk_counts[level]
              return (
                <li key={level} data-threat={level === 'Critical' || undefined} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: RISK_COLORS[level] }} />
                  <span>{level}</span>
                  <span className="num ml-auto">{fmt(n)}</span>
                  <span className="num w-14 text-right text-muted">
                    {((100 * n) / Math.max(k.total_flows, 1)).toFixed(1)}%
                  </span>
                </li>
              )
            })}
          </ul>
        </Panel>

        <Panel title="Attacks by type" note="Select an attack to see its flows." className="lg:col-span-3">
          {data.attack_counts.length ? (
            <EChart
              option={bars}
              height={Math.max(160, data.attack_counts.length * 30 + 8)}
              onClick={openAttack}
              label="Bar chart of detected flows per attack type"
            />
          ) : (
            <p className="text-sm text-muted">No attacks were detected in this file.</p>
          )}
        </Panel>
      </div>

      <Panel
        title="Model confidence"
        note="Only flows flagged by Stage 1 get a Stage 2 confidence score. Each column starts at the value shown."
        className="mt-6"
      >
        {confidence ? (
          <EChart option={confidence} height={240} label="Histogram of Stage 2 model confidence" />
        ) : (
          <p className="text-sm text-muted">No confidence scores are available.</p>
        )}
      </Panel>
    </Reveal>
    </>
  )
}

// A red wave crosses the screen once, the first time a job's threats are shown
function ScanWave({ jobId }) {
  const el = useRef(null)
  const key = `cybersentry.wave.${jobId}`

  useLayoutEffect(() => {
    let seen = false
    try {
      seen = sessionStorage.getItem(key) === '1'
    } catch {
      // storage blocked: the wave may just play again
    }
    if (seen || reducedMotion()) return
    const tween = gsap.fromTo(
      el.current,
      { yPercent: -100, autoAlpha: 1 },
      {
        yPercent: 100,
        duration: 1.5,
        delay: 0.2,
        ease: 'power1.inOut',
        onComplete: () => {
          gsap.set(el.current, { autoAlpha: 0 })
          try {
            sessionStorage.setItem(key, '1')
          } catch {
            // see above
          }
        },
      },
    )
    return () => tween.kill()
  }, [key])

  return (
    <div
      ref={el}
      aria-hidden="true"
      className="pointer-events-none invisible fixed inset-0 z-20 bg-[linear-gradient(to_bottom,transparent_30%,rgb(225_29_72/0.10)_78%,rgb(225_29_72/0.42)_98%,transparent)]"
    />
  )
}
