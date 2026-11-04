import { Fragment, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api, urls } from '../api'
import { Reveal } from '../components/fx'
import RiskBadge from '../components/RiskBadge'
import { ErrorNote, Loading, PageHeader, Stat } from '../components/ui'
import { useJob } from '../JobContext'
import { fmt, fmtValue, pct } from '../risk'

const PAGE_SIZE = 25

const COLUMNS = [
  { key: 'row', label: 'Flow', sortable: true },
  { key: 'attack_type', label: 'Attack type', sortable: true },
  { key: 'risk_level', label: 'Risk', sortable: true },
  { key: 'confidence', label: 'Confidence', sortable: true, align: 'right' },
  { key: 'stage1_score', label: 'Stage 1 score', sortable: true, align: 'right' },
  { key: 'needs_review', label: 'Review' },
  { key: 'Destination Port', label: 'Dest. port', align: 'right' },
]

const CHIPS = [
  { label: 'All threats', risk: '', review: '' },
  { label: 'Critical', risk: 'Critical', review: '' },
  { label: 'High + Critical', risk: 'High,Critical', review: '' },
  { label: 'Needs review', risk: '', review: 'yes' },
]

const selectClass = 'border border-line bg-panel px-3 py-2 text-sm focus:border-cyan focus:outline-none'

export default function Detection() {
  const { jobId } = useJob()
  const [sp, setSp] = useSearchParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [openRow, setOpenRow] = useState(null)

  // Filters live in the URL, so charts can link here and refresh keeps them
  const attack = sp.get('attack_type') ?? ''
  const risk = sp.get('risk') ?? ''
  const review = sp.get('review') ?? ''
  const includeBenign = sp.get('scope') === 'all'
  const page = Number(sp.get('page')) || 1
  const sort = sp.get('sort') ?? 'row'
  const order = sp.get('order') ?? 'asc'

  const filters = {
    scope: includeBenign ? 'all' : 'threats',
    attack_type: attack,
    risk,
    needs_review: review === 'yes' ? 'true' : review === 'no' ? 'false' : '',
  }

  function update(patch) {
    setOpenRow(null)
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (!('page' in patch)) next.delete('page')
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        return next
      },
      { replace: true },
    )
  }

  const queryKey = JSON.stringify({ ...filters, page, sort, order })
  useEffect(() => {
    let cancelled = false
    api
      .results(jobId, { ...JSON.parse(queryKey), size: PAGE_SIZE })
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [jobId, queryKey])

  if (error) return <div className="mx-auto max-w-[1560px] px-6 py-12"><ErrorNote>{error}</ErrorNote></div>
  if (!data) return <Loading />

  const f = data.flows
  const first = f.total ? (f.page - 1) * f.size + 1 : 0
  const last = Math.min(f.page * f.size, f.total)
  const riskOptions = ['Medium', 'High', 'Critical']

  return (
    <Reveal as="section" className="mx-auto max-w-[1560px] px-6 py-10">
      <PageHeader eyebrow={`Threat detection · ${data.filename}`} title="Flagged flows">
        <a
          href={urls.flowsCsv(jobId, filters)}
          download
          className="btn"
        >
          Export CSV
        </a>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => {
          const active = risk === c.risk && review === c.review && !attack && !includeBenign
          return (
            <button
              key={c.label}
              type="button"
              aria-pressed={active}
              onClick={() => update({ risk: c.risk, review: c.review, attack_type: '', scope: '' })}
              className={`num border px-3 py-1.5 text-[11px] tracking-[0.12em] uppercase transition ${
                active ? 'border-cyan bg-cyan/15 text-cyan' : 'border-line text-muted hover:text-text'
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="filter-attack">Attack type</label>
        <select id="filter-attack" className={selectClass} value={attack} onChange={(e) => update({ attack_type: e.target.value })}>
          <option value="">All attack types</option>
          {data.filters.attack_types.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <label className="sr-only" htmlFor="filter-risk">Risk level</label>
        <select id="filter-risk" className={selectClass} value={risk} onChange={(e) => update({ risk: e.target.value })}>
          <option value="">All risk levels</option>
          {includeBenign && <option value="Low">Low</option>}
          {riskOptions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
          <option value="High,Critical">High + Critical</option>
        </select>

        <label className="sr-only" htmlFor="filter-review">Review status</label>
        <select id="filter-review" className={selectClass} value={review} onChange={(e) => update({ review: e.target.value })}>
          <option value="">Any review status</option>
          <option value="yes">Needs review</option>
          <option value="no">No review needed</option>
        </select>

        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={includeBenign}
            onChange={(e) => update({ scope: e.target.checked ? 'all' : '', risk: e.target.checked ? risk : risk === 'Low' ? '' : risk })}
            className="accent-cyan-400"
          />
          Include benign flows
        </label>
      </div>

      <div data-stagger className="cells mt-4 grid-cols-2">
        <Stat label="Matching flows" value={f.total} />
        <Stat label="Of those, needing review" value={f.needs_review} tone={f.needs_review ? 'text-amber' : 'text-text'} />
      </div>

      {review === 'yes' && !attack && !risk && !includeBenign && data.kpis.needs_review > f.needs_review && (
        <p className="mt-3 text-sm text-muted">
          {fmt(data.kpis.needs_review - f.needs_review)} more low-confidence flows were classified as BENIGN. Tick
          “Include benign flows” to see them.
        </p>
      )}

      <div className="panel mt-4 overflow-x-auto ">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs tracking-wider text-muted uppercase">
              {COLUMNS.map((c) => {
                const active = sort === c.key
                const nextOrder = active && order === 'asc' ? 'desc' : 'asc'
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={`px-4 py-3 font-medium ${c.align === 'right' ? 'text-right' : ''}`}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        className={`uppercase hover:text-text ${active ? 'text-cyan' : ''}`}
                        onClick={() => update({ sort: c.key, order: nextOrder })}
                      >
                        {c.label}
                        {active ? (order === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {f.rows.map((r) => (
              <Fragment key={r.row}>
                <tr
                  tabIndex={0}
                  data-threat={r.risk_level === 'Critical' || undefined}
                  aria-expanded={openRow === r.row}
                  onClick={() => setOpenRow(openRow === r.row ? null : r.row)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setOpenRow(openRow === r.row ? null : r.row)
                    }
                  }}
                  className="cursor-pointer border-b border-line/60 transition-colors hover:bg-cyan/5 hover:shadow-[inset_2px_0_0_var(--color-cyan)] focus-visible:bg-cyan/5 focus-visible:shadow-[inset_2px_0_0_var(--color-cyan)] focus-visible:outline-none"
                >
                  <td className="num px-4 py-2.5 text-muted">#{r.row}</td>
                  <td className="px-4 py-2.5 font-medium">{r.attack_type}</td>
                  <td className="px-4 py-2.5"><RiskBadge level={r.risk_level} /></td>
                  <td className="num px-4 py-2.5 text-right">{pct(r.confidence)}</td>
                  <td className="num px-4 py-2.5 text-right">{r.stage1_score?.toFixed(3)}</td>
                  <td className="px-4 py-2.5">
                    {r.needs_review ? <span className="text-amber">Needs review</span> : <span className="text-muted">No</span>}
                  </td>
                  <td className="num px-4 py-2.5 text-right">{r['Destination Port']}</td>
                </tr>
                {openRow === r.row && <FlowDetail jobId={jobId} row={r.row} />}
              </Fragment>
            ))}
            {f.rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-6 py-10 text-center text-muted">
                  No flows match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span className="num">
          {fmt(first)} to {fmt(last)} of {fmt(f.total)}
        </span>
        <div className="flex items-center gap-2">
          <PageButton disabled={f.page <= 1} onClick={() => update({ page: String(f.page - 1) })}>Previous</PageButton>
          <span className="num">
            Page {f.page} of {f.pages}
          </span>
          <PageButton disabled={f.page >= f.pages} onClick={() => update({ page: String(f.page + 1) })}>Next</PageButton>
        </div>
      </div>
    </Reveal>
  )
}

function PageButton({ children, ...props }) {
  return (
    <button
      type="button"
      className="border border-line px-3 py-1.5 hover:text-text disabled:opacity-40 disabled:hover:text-muted"
      {...props}
    >
      {children}
    </button>
  )
}

function FlowDetail({ jobId, row }) {
  const [flow, setFlow] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.flow(jobId, row).then(setFlow).catch((e) => setError(e.message))
  }, [jobId, row])

  return (
    <tr className="border-b border-line/60 bg-panel-2">
      <td colSpan={COLUMNS.length} className="px-4 py-4">
        {error && <p className="text-red-soft">{error}</p>}
        {!error && !flow && <p className="text-muted">Loading flow features…</p>}
        {flow && (
          <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(flow.features).map(([name, value]) => (
              <div key={name} className="flex justify-between gap-3 border-b border-line/40 py-1">
                <dt className="text-muted">{name}</dt>
                <dd className="num">{fmtValue(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </td>
    </tr>
  )
}
