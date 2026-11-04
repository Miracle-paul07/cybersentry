import { RISK_COLORS } from '../risk'

// Colour is never the only signal: a coloured dot plus the level written out
export default function RiskBadge({ level }) {
  const color = RISK_COLORS[level] ?? '#8a94b3'
  return (
    <span
      data-threat={level === 'Critical' || undefined}
      className="num inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] tracking-[0.1em] uppercase whitespace-nowrap"
      style={{ borderColor: `${color}66`, background: `${color}1a` }}
    >
      <span className="h-1.5 w-1.5" style={{ background: color }} />
      {level}
    </span>
  )
}
