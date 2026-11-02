// One incident report's live state: queued / generating... / ready / failed (template used).
// A template report with no Groq key or internet is expected, so it counts as ready.
function describe({ status, source }) {
  if (status === 'failed') return { label: source ? 'failed (template used)' : 'failed', tone: 'text-amber', mark: '!' }
  if (status === 'ready') {
    return { label: source?.startsWith('template') ? 'ready (template)' : 'ready', tone: 'text-cyan', mark: '✓' }
  }
  if (status === 'generating') return { label: 'generating...', tone: 'text-cyan', mark: null }
  return { label: 'queued', tone: 'text-muted', mark: '·' }
}

export default function ReportState({ report, className = '' }) {
  const { label, tone, mark } = describe(report)
  return (
    <span className={`num inline-flex items-center gap-1.5 text-xs ${tone} ${className}`}>
      <span className="w-3 text-center" aria-hidden="true">
        {mark ?? <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-cyan" />}
      </span>
      {label}
    </span>
  )
}
