import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { api } from '../api'
import EChart from '../components/EChart'
import { Reveal, TiltCard } from '../components/fx'
import { SERIES, featureDumbbell, histogramColumns } from '../components/chartOptions'
import RiskBadge from '../components/RiskBadge'
import { EmptyState, ErrorNote, Loading, PageHeader, Panel, Stat } from '../components/ui'
import { useJob } from '../JobContext'
import { fmt, fmtValue } from '../risk'

export default function Analysis() {
  const { jobId } = useJob()
  const { type } = useParams()
  const navigate = useNavigate()
  const [attacks, setAttacks] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api
      .attacks(jobId)
      .then((d) => setAttacks(d.attacks))
      .catch((e) => setError(e.message))
  }, [jobId])

  if (error) return <div className="mx-auto max-w-6xl px-4 py-12"><ErrorNote>{error}</ErrorNote></div>
  if (!attacks) return <Loading />

  if (attacks.length === 0) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-10">
        <PageHeader eyebrow="Threat analysis" title="Attack patterns" />
        <EmptyState title="Nothing to analyse">No attacks were detected in this file.</EmptyState>
      </section>
    )
  }
  if (!type) return <Navigate to={`/analysis/${encodeURIComponent(attacks[0].attack_type)}`} replace />

  return (
    <Reveal as="section" className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader eyebrow="Threat analysis" title="Attack patterns" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {attacks.map((a) => {
          const active = a.attack_type === type
          return (
            <TiltCard
              as="button"
              max={4}
              key={a.attack_type}
              type="button"
              aria-pressed={active}
              data-threat={a.severity === 'Critical' || undefined}
              onClick={() => navigate(`/analysis/${encodeURIComponent(a.attack_type)}`, { replace: true })}
              className={`flex flex-col rounded-xl border p-4 text-left transition-colors ${
                active ? 'border-cyan bg-cyan/10 shadow-[0_0_20px_rgb(34_211_238/0.15)]' : 'border-line bg-panel hover:border-cyan/50'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{a.attack_type}</span>
                <RiskBadge level={a.severity} />
              </span>
              <span className="mt-2 line-clamp-2 block text-xs text-muted">{a.description}</span>
              <span className="num mt-auto block pt-2 text-sm">{fmt(a.count)} flows</span>
            </TiltCard>
          )
        })}
      </div>

      <AttackDetail key={type} jobId={jobId} type={type} />
    </Reveal>
  )
}

function AttackDetail({ jobId, type }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState([])

  useEffect(() => {
    api
      .attack(jobId, type)
      .then((d) => {
        setData(d)
        setSelected(d.default_features)
      })
      .catch((e) => setError(e.message))
  }, [jobId, type])

  const rows = useMemo(
    () => selected.map((f) => data?.feature_comparison.find((r) => r.feature === f)).filter(Boolean),
    [selected, data],
  )
  const scores = useMemo(
    () =>
      data?.stage1_histogram &&
      histogramColumns(data.stage1_histogram, { axisName: 'Stage 1 anomaly score', color: SERIES.threat }),
    [data],
  )
  const dumbbell = useMemo(() => (rows.length ? featureDumbbell(rows, type) : null), [rows, type])

  if (error) return <div className="mt-6"><ErrorNote>{error}</ErrorNote></div>
  if (!data) return <Loading />

  const available = data.feature_comparison.filter((r) => !selected.includes(r.feature))
  const hasUndrawable = rows.some((r) => !r.drawable)

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-bold">{data.attack_type}</h2>
        <RiskBadge level={data.severity} />
        {data.mitre.map((m) => (
          <span key={m} className="num rounded border border-line bg-panel px-2 py-0.5 text-xs text-muted">
            {m}
          </span>
        ))}
      </div>
      <p className="mt-2 max-w-3xl text-sm text-muted">{data.description}</p>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Flows" value={data.count} />
        <Stat label="Share of traffic" value={data.share_pct} format={(v) => `${v.toFixed(2)}%`} />
        <Stat
          label="Avg confidence"
          value={data.avg_confidence == null ? 'n/a' : data.avg_confidence * 100}
          format={(v) => `${v.toFixed(1)}%`}
        />
        <Stat label="Needs review" value={data.needs_review} tone={data.needs_review ? 'text-amber' : 'text-text'} />
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link to={`/detection?attack_type=${encodeURIComponent(type)}`} className="text-cyan underline-offset-4 hover:underline">
          View these flows
        </Link>
        <Link to={`/reports/${encodeURIComponent(type)}`} className="text-cyan underline-offset-4 hover:underline">
          Open incident report
        </Link>
      </div>

      <Panel title="Stage 1 score distribution" note="Each column starts at the value shown." className="mt-6">
        {scores ? (
          <EChart option={scores} height={220} label={`Histogram of Stage 1 scores for ${type}`} />
        ) : (
          <p className="text-sm text-muted">No Stage 1 scores are available for this attack.</p>
        )}
      </Panel>

      <Panel
        title={`${type} vs BENIGN`}
        note="Feature averages on a log scale. By default, the 5 features that differ most from normal traffic."
        className="mt-6"
      >
        {data.benign_count === 0 ? (
          <p className="text-sm text-muted">BENIGN rows are required for feature comparison.</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {selected.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-label={`Remove ${f}`}
                  onClick={() => setSelected(selected.filter((x) => x !== f))}
                  className="rounded-full border border-line bg-panel-2 px-3 py-1 text-xs hover:border-red/60"
                >
                  {f} <span aria-hidden="true" className="text-muted">×</span>
                </button>
              ))}
              <label className="sr-only" htmlFor="add-feature">Add a feature</label>
              <select
                id="add-feature"
                value=""
                onChange={(e) => e.target.value && setSelected([...selected, e.target.value])}
                className="rounded-full border border-line bg-panel px-3 py-1 text-xs focus:border-cyan focus:outline-none"
              >
                <option value="">Add feature…</option>
                {available.map((r) => (
                  <option key={r.feature} value={r.feature}>{r.feature}</option>
                ))}
              </select>
            </div>

            {dumbbell ? (
              <EChart
                option={dumbbell}
                height={70 + rows.length * 40}
                label={`Log-scale comparison of feature averages, ${type} versus BENIGN`}
              />
            ) : (
              <p className="text-sm text-muted">Select at least one feature to compare.</p>
            )}

            {rows.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs tracking-wider text-muted uppercase">
                      <th scope="col" className="py-2 pr-4 font-medium">Feature</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">{type} mean</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">BENIGN mean</th>
                      <th scope="col" className="py-2 text-right font-medium">× normal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.feature} className="border-b border-line/50">
                        <td className="py-2 pr-4">{r.feature}</td>
                        <td className="num py-2 pr-4 text-right">{fmtValue(r.attack_mean)}</td>
                        <td className="num py-2 pr-4 text-right">{fmtValue(r.benign_mean)}</td>
                        <td className="num py-2 text-right">
                          {r.drawable ? fmtValue(r.attack_mean / r.benign_mean) : 'n/a'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {hasUndrawable && (
              <p className="mt-3 text-xs text-muted">
                Zero or negative averages cannot be drawn on a log scale; see the table for exact values.
              </p>
            )}
          </>
        )}
      </Panel>
    </div>
  )
}
