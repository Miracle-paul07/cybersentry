// Small building blocks shared by the result pages
import { CountUp, TiltCard } from './fx'

export function PageHeader({ eyebrow, title, children }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="num text-xs tracking-widest text-cyan uppercase">{eyebrow}</p>
        <h1 className="mt-2 font-display text-2xl font-bold sm:text-3xl">{title}</h1>
      </div>
      {children}
    </header>
  )
}

export function Panel({ title, note, children, className = '' }) {
  return (
    <div className={`panel rounded-xl p-5 ${className}`}>
      {title && <h2 className="font-semibold">{title}</h2>}
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      <div className={title || note ? 'mt-4' : ''}>{children}</div>
    </div>
  )
}

// A number value counts up; pass `format` for anything that isn't a plain count
export function Stat({ label, value, format, tone = 'text-text' }) {
  return (
    <TiltCard className="glass rounded-xl p-4">
      <p className="text-xs tracking-wider text-muted uppercase">{label}</p>
      <p className={`num mt-2 text-2xl font-semibold sm:text-3xl ${tone}`}>
        {typeof value === 'number' ? <CountUp value={value} format={format} /> : value}
      </p>
    </TiltCard>
  )
}

export function Loading() {
  return <p className="num px-4 py-16 text-center text-sm text-muted">Loading…</p>
}

export function ErrorNote({ children }) {
  return (
    <p role="alert" className="rounded-lg border border-red/50 bg-red/10 p-4 text-sm text-red-soft">
      {children}
    </p>
  )
}

export function Warnings({ items }) {
  if (!items?.length) return null
  return (
    <div className="mb-4 space-y-2">
      {items.map((w) => (
        <p key={w} className="rounded-lg border border-amber/40 bg-amber/10 px-4 py-2 text-sm">
          {w}
        </p>
      ))}
    </div>
  )
}

export function EmptyState({ title, children }) {
  return (
    <div className="glass rounded-xl p-10 text-center">
      <p className="font-display text-lg font-bold text-cyan">{title}</p>
      <p className="mt-2 text-sm text-muted">{children}</p>
    </div>
  )
}
