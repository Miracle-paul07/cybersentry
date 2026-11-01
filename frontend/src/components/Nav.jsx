import { Link, NavLink } from 'react-router'
import { useJob } from '../JobContext'

const LOCKED_LINKS = [
  ['/overview', 'Overview'],
  ['/detection', 'Detection'],
  ['/analysis', 'Analysis'],
  ['/reports', 'Reports'],
]

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="ml-1 inline h-3 w-3 opacity-60" fill="currentColor" role="img" aria-label="locked">
      <path d="M5 7V5a3 3 0 0 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v4a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
    </svg>
  )
}

export default function Nav() {
  const { ready, running, jobId } = useJob()
  const linkClass = ({ isActive }) =>
    `rounded-full px-3 py-1.5 text-sm transition-colors ${isActive ? 'bg-cyan/10 text-cyan' : 'text-muted hover:text-text'}`

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-ink/70 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-2.5">
        <Link to="/" className="mr-3 font-display text-sm font-bold tracking-tight">
          Cyber<span className="text-cyan">Sentry</span>
        </Link>
        <NavLink to="/" end className={linkClass}>
          Upload
        </NavLink>
        {running && (
          <NavLink to={`/scan/${jobId}`} className={linkClass}>
            <span className="text-amber">● Live scan</span>
          </NavLink>
        )}
        {LOCKED_LINKS.map(([to, label]) => (
          <NavLink key={to} to={to} className={linkClass} title={ready ? undefined : 'Run an analysis first'}>
            {label}
            {!ready && <LockIcon />}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
