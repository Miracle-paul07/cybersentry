// Small building blocks shared by the result pages
import { useLocation } from 'react-router'
import { CountUp, Scramble } from './fx'

const PAGE_NUMBER = { overview: '01', detection: '02', analysis: '03', reports: '04', evaluation: '05' }

export function PageHeader({ eyebrow, title, children }) {
  const number = PAGE_NUMBER[useLocation().pathname.split('/')[1]]
  return (
    <header className="page-header relative mb-8 flex flex-wrap items-end justify-between gap-6 pb-6">
      <div className="min-w-0">
        <p className="num text-xs tracking-widest text-cyan uppercase">
          <Scramble text={number ? `[ ${number} ]  ${eyebrow}` : eyebrow} onMount className="whitespace-pre-wrap" />
        </p>
        <h1 className="mt-3 overflow-hidden font-display text-[clamp(3.5rem,10vw,9.5rem)] leading-[0.88] font-bold uppercase">
          <span className="rise block">{title}</span>
        </h1>
      </div>
      {children}
    </header>
  )
}

export function Panel({ title, note, children, className = '' }) {
  return (
    <div className={`panel ticks p-6 ${className}`}>
      {title && <h2 className="num text-[11px] tracking-[0.2em] text-cyan uppercase">{title}</h2>}
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      <div className={title || note ? 'mt-4' : ''}>{children}</div>
    </div>
  )
}

// A number value counts up; pass `format` for anything that isn't a plain count
export function Stat({ label, value, format, tone = 'text-text' }) {
  return (
    <div className="cell" data-threat={tone === 'text-red-soft' || undefined}>
      <p className="num text-[11px] tracking-[0.16em] text-muted uppercase">{label}</p>
      <p className={`mt-3 font-display text-[clamp(3rem,5.5vw,5.5rem)] leading-none font-bold ${tone}`}>
        {typeof value === 'number' ? <CountUp value={value} format={format} /> : value}
      </p>
    </div>
  )
}

export function Loading() {
  return <p className="num px-4 py-16 text-center text-sm text-muted">Loading…</p>
}

export function ErrorNote({ children }) {
  return (
    <p role="alert" className="border border-red/50 bg-red/10 p-4 text-sm text-red-soft">
      {children}
    </p>
  )
}

export function Warnings({ items }) {
  if (!items?.length) return null
  return (
    <div className="mb-4 space-y-2">
      {items.map((w) => (
        <p key={w} className="border border-amber/40 bg-amber/10 px-4 py-2 text-sm">
          {w}
        </p>
      ))}
    </div>
  )
}

export function EmptyState({ title, children }) {
  return (
    <div className="glass ticks p-12 text-center">
      <p className="font-display text-5xl font-bold text-cyan uppercase">{title}</p>
      <p className="mt-2 text-sm text-muted">{children}</p>
    </div>
  )
}
