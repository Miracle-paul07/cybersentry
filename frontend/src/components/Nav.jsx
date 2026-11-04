import { motion } from 'motion/react'
import { Link, NavLink } from 'react-router'
import { useJob } from '../JobContext'
import { Scramble, reducedMotion } from './fx'

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

// A line slides between the links to mark the current page
function ActiveLine() {
  return (
    <motion.span
      layoutId="nav-active"
      aria-hidden="true"
      transition={reducedMotion() ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }}
      className="absolute inset-x-2 -bottom-[11px] h-px bg-cyan shadow-[0_0_8px_var(--color-cyan)]"
    />
  )
}

function NavItem({ to, index, label, end, title, children }) {
  return (
    <NavLink to={to} end={end} title={title} className={LINK_CLASS}>
      {({ isActive }) => (
        <>
          {index !== undefined && <span className="mr-1.5 text-muted/60">0{index}</span>}
          <Scramble text={label} hover />
          {children}
          {isActive && <ActiveLine />}
        </>
      )}
    </NavLink>
  )
}

const LINK_CLASS = ({ isActive }) =>
  `num relative rounded px-2 py-1.5 text-[11px] tracking-[0.12em] uppercase transition-colors ${isActive ? 'text-cyan' : 'text-muted hover:text-text'}`

export default function Nav() {
  const { ready, running, jobId, job, reportsPending } = useJob()
  const reportsTotal = job?.counts.reports_total ?? 0
  // Only a file with a Label column can be scored
  const links = job?.has_evaluation ? [...LOCKED_LINKS, ['/evaluation', 'Model Evaluation']] : LOCKED_LINKS

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-ink">
      <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 px-6 py-2.5">
        <Link to="/" className="mr-auto font-display text-2xl leading-none font-extrabold tracking-wide uppercase">
          Cyber<span className="text-cyan">Sentry</span>
        </Link>
        <NavItem to="/" end index={0} label="Upload" />
        {running && (
          <NavLink to={`/scan/${jobId}`} className={LINK_CLASS}>
            {({ isActive }) => (
              <>
                <span className="text-amber">● Live scan</span>
                {isActive && <ActiveLine />}
              </>
            )}
          </NavLink>
        )}
        {links.map(([to, label], i) => (
          <NavItem key={to} to={to} index={i + 1} label={label} title={ready ? undefined : 'Run an analysis first'}>
            {!ready && <LockIcon />}
            {to === '/reports' && ready && reportsTotal > 0 && (
              <span
                className={`ml-1.5 inline-flex items-center gap-1 ${reportsPending ? 'text-amber' : 'text-muted'}`}
                title={`${job.counts.reports_done} of ${reportsTotal} incident reports finished`}
              >
                {reportsPending && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber" aria-hidden="true" />}
                {job.counts.reports_done}/{reportsTotal}
              </span>
            )}
          </NavItem>
        ))}
      </nav>
    </header>
  )
}
