import { RISK_COLORS } from '../risk'

// Colour is never the only signal: a coloured dot plus the level written out
export default function RiskBadge({ level }) {
  const color = RISK_COLORS[level] ?? '#8a94b3'
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ borderColor: `${color}66`, background: `${color}1a` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {level}
    </span>
  )
}
