import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { api, urls } from '../api'
import { Magnetic, Reveal } from '../components/fx'
import ReportState from '../components/ReportState'
import RiskBadge from '../components/RiskBadge'
import { EmptyState, ErrorNote, Loading, PageHeader, Warnings } from '../components/ui'
import { useJob } from '../JobContext'
import { RISK_COLORS, fmt, fmtValue } from '../risk'

// times_normal can be a number, null, or the phrase "not seen in normal traffic"
const show = (v) => (typeof v === 'number' ? fmtValue(v) : (v ?? 'n/a'))

export default function Reports() {
  // The list and its states come from the job poll, so this page updates by itself
  const { jobId, job, reports, reportsPending } = useJob()
  const { type } = useParams()

  if (reports.length === 0) {
    return (
      <section className="mx-auto max-w-[1560px] px-6 py-10">
        <PageHeader eyebrow="Incident reports" title="Open incidents" />
        <EmptyState title="No incidents">No attacks were detected, so there are no incident reports.</EmptyState>
      </section>
    )
  }
  // Most severe first, so this opens on the report that gets written first
  if (!type) return <Navigate to={`/reports/${encodeURIComponent(reports[0].attack_type)}`} replace />

  const selected = reports.find((r) => r.attack_type === type)

  return (
    <Reveal as="section" className="mx-auto max-w-[1560px] px-6 py-10">
      <PageHeader eyebrow="Incident reports" title="Open incidents" />
      <p className="-mt-3 mb-4 text-sm text-muted">
        Reports are AI-assisted evidence summaries and require human review.
        {reportsPending && ' Reports are being written most severe first, and appear here as they finish.'}
      </p>
      <Warnings items={job?.warnings} />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav aria-label="Incidents" className="space-y-2">
          {reports.map((r) => {
            const active = r.attack_type === type
            return (
              <Link
                key={r.attack_type}
                to={`/reports/${encodeURIComponent(r.attack_type)}`}
                replace
                aria-current={active ? 'page' : undefined}
                data-threat={r.severity === 'Critical' || undefined}
                className={`block border px-3 py-2 text-sm transition ${
                  active ? 'border-cyan bg-cyan/10' : 'border-line bg-panel hover:border-cyan/50'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-display text-xl leading-none font-bold uppercase">{r.attack_type}</span>
                  <RiskBadge level={r.severity} />
                </span>
                <ReportState report={r} className="mt-1" />
              </Link>
            )
          })}
        </nav>

        {selected ? (
          selected.source ? (
            <Ticket key={type} jobId={jobId} type={type} failed={selected.status === 'failed'} />
          ) : (
            <Waiting report={selected} />
          )
        ) : (
          <ErrorNote>No incident report for "{type}".</ErrorNote>
        )}
      </div>
    </Reveal>
  )
}

function Downloads({ jobId, type }) {
  return (
    <div className="flex gap-2">
      <Magnetic strength={0.2}>
        <a href={urls.reportFile(jobId, type, 'pdf')} download className="btn">
          Download PDF
        </a>
      </Magnetic>
      <Magnetic strength={0.2}>
        <a href={urls.reportFile(jobId, type, 'txt')} download className="btn btn-ghost">
          Download TXT
        </a>
      </Magnetic>
    </div>
  )
}

// A report still queued or being written, or one that could not be created at all
function Waiting({ report }) {
  const color = RISK_COLORS[report.severity] ?? '#8a94b3'
  const note = {
    queued: 'Waiting its turn. Reports are written most severe first.',
    generating: 'Being written now. It will appear here as soon as it is ready.',
    failed: 'This report could not be created.',
  }[report.status]

  return (
    <article className="panel min-w-0 overflow-hidden ">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" style={{ background: `${color}26`, borderBottom: `2px solid ${color}` }}>
        <p className="flex items-center gap-2 text-sm font-bold tracking-widest uppercase">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          {report.severity} severity
        </p>
        <ReportState report={report} />
      </div>
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-5xl leading-none font-bold uppercase">{report.attack_type}</h2>
            <p className="mt-1 text-sm text-muted">{fmt(report.flows)} flows detected</p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled className="btn btn-ghost cursor-not-allowed opacity-50">
              Download PDF
            </button>
            <button type="button" disabled className="btn btn-ghost cursor-not-allowed opacity-50">
              Download TXT
            </button>
          </div>
        </div>
        <p role="status" className="mt-6 text-sm text-muted">{note}</p>
      </div>
    </article>
  )
}

function Ticket({ jobId, type, failed }) {
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.report(jobId, type).then(setReport).catch((e) => setError(e.message))
  }, [jobId, type])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!report) return <Loading />

  const { narrative: n, evidence: e, grounding, severity, source } = report
  const color = RISK_COLORS[severity] ?? '#8a94b3'
  const isLlm = !source.startsWith('template')

  return (
    <article className="panel min-w-0 overflow-hidden ">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" style={{ background: `${color}26`, borderBottom: `2px solid ${color}` }}>
        <p className="flex items-center gap-2 text-sm font-bold tracking-widest uppercase">
          <span className={`h-2 w-2 rounded-full ${severity === 'Critical' ? 'animate-pulse' : ''}`} style={{ background: color }} />
          {severity} severity
        </p>
        <p className="num text-sm">{report.incident_id}</p>
      </div>

      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-5xl leading-none font-bold uppercase">{n.title}</h2>
            <p className="num mt-1 text-xs text-muted">Generated {e.generated_at}</p>
          </div>
          <Downloads jobId={jobId} type={type} />
        </div>

        {failed && (
          <p className="mt-3 rounded border border-amber/40 bg-amber/10 px-3 py-2 text-sm">
            The AI report failed, so this one was filled in from the evidence by the template.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {e.mitre_attack.length ? (
            e.mitre_attack.map((m) => (
              <span key={m} className="num border border-line bg-panel-2 px-2 py-0.5 text-xs">
                MITRE ATT&CK {m}
              </span>
            ))
          ) : (
            <span className="text-xs text-muted">No MITRE ATT&CK mapping</span>
          )}
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 border border-line bg-panel-2 p-4 md:grid-cols-4">
          <Fact label="Flows detected" value={fmt(e.flows_detected)} />
          <Fact label="Share of traffic" value={`${e.share_of_analysed_traffic_pct}%`} />
          <Fact label="Confidence" value={`${e.mean_confidence_pct}% mean, ${e.min_confidence_pct}% min`} />
          <Fact label="Needs review" value={fmt(e.flows_needing_analyst_review)} />
        </dl>

        <Section title="Summary"><p>{n.summary}</p></Section>
        <Section title="What happened"><p>{n.what_happened}</p></Section>

        <Section title="Key evidence">
          <ul className="list-disc space-y-1 pl-5">
            {n.key_evidence.map((x) => <li key={x}>{x}</li>)}
          </ul>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs tracking-wider text-muted uppercase">
                  <th scope="col" className="py-2 pr-4 font-medium">Feature</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Unit</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Attack median</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Normal median</th>
                  <th scope="col" className="py-2 text-right font-medium">× normal</th>
                </tr>
              </thead>
              <tbody>
                {e.most_unusual_features_vs_normal.map((r) => (
                  <tr key={r.feature} className="border-b border-line/50">
                    <td className="py-2 pr-4">{r.feature}</td>
                    <td className="py-2 pr-4 text-xs text-muted">{r.unit}</td>
                    <td className="num py-2 pr-4 text-right">{show(r.attack_median)}</td>
                    <td className="num py-2 pr-4 text-right">{show(r.normal_median)}</td>
                    <td className="num py-2 text-right">{show(r.times_normal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {e.top_destination_ports?.length > 0 && (
            <p className="mt-3 text-sm text-muted">
              Top destination ports:{' '}
              <span className="num text-text">
                {e.top_destination_ports.map((p) => `${p.port} (${fmt(p.flows)} flows)`).join(', ')}
              </span>
            </p>
          )}
        </Section>

        <Section title="Potential impact"><p>{n.potential_impact}</p></Section>

        <Section title="Recommended actions">
          <ol className="list-decimal space-y-1 pl-5">
            {n.recommended_actions.map((x) => <li key={x}>{x}</li>)}
          </ol>
        </Section>

        <Section title="Analyst note"><p>{n.analyst_note}</p></Section>

        <footer className="mt-6 space-y-2 border-t border-line pt-4 text-xs text-muted">
          <p>
            Narrative source: <span className="num text-text">{source}</span>
            {isLlm ? ' (AI-written from the evidence above)' : ' (filled from the evidence only)'}
          </p>
          {grounding.grounded ? (
            <p>Grounding check: all numbers match the evidence.</p>
          ) : (
            <p className="rounded border border-amber/40 bg-amber/10 px-3 py-2 text-text">
              Grounding check: these numbers were not found in the evidence, verify them:{' '}
              <span className="num">{grounding.unsupported_numbers.join(', ')}</span>
            </p>
          )}
        </footer>
      </div>
    </article>
  )
}

function Fact({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-1 text-sm">{value}</dd>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-sm font-semibold tracking-wider text-cyan uppercase">{title}</h3>
      <div className="text-sm leading-relaxed">{children}</div>
    </section>
  )
}
