// One colour per risk level, used everywhere (badges, charts, banners).
// Checked for colour-blind and normal-vision separation on the dark panel colour.
export const RISK_LEVELS = ['Low', 'Medium', 'High', 'Critical']

export const RISK_COLORS = {
  Low: '#22d3ee',
  Medium: '#fbbf24',
  High: '#f97316',
  Critical: '#e11d48',
}

export const fmt = (n) => (n ?? 0).toLocaleString('en-US')
export const pct = (x, digits = 1) => (x == null ? 'n/a' : `${(x * 100).toFixed(digits)}%`)

// Feature values range from 0.0001 to 100,000,000
export function fmtValue(x) {
  if (x == null) return 'n/a'
  const abs = Math.abs(x)
  if (abs >= 1000) return Math.round(x).toLocaleString('en-US')
  if (abs >= 1 || abs === 0) return x.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return x.toPrecision(3)
}
