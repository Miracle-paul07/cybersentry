import { Link } from 'react-router'
import { Magnetic } from './fx'
import { useJob } from '../JobContext'

// Pages 3-6 need finished detection (reports can still be running); until then show the "awaiting" state.
export default function Locked({ children }) {
  const { ready, running, checking, jobId } = useJob()
  if (checking) return null
  if (ready) return children

  return (
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center">
      <div className="radar relative h-40 w-40 overflow-hidden rounded-full border border-cyan/25" aria-hidden="true">
        <div className="radar-sweep absolute inset-0 rounded-full" />
        <span className="absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan shadow-[0_0_10px_var(--color-cyan)]" />
      </div>
      <p className="num mt-8 text-xs tracking-widest text-cyan uppercase">No telemetry received</p>
      <h1 className="mt-3 font-display text-2xl font-bold sm:text-3xl">Awaiting network data</h1>
      <p className="mt-4 text-muted">
        {running
          ? 'An analysis is still running. Results unlock as soon as detection finishes.'
          : 'Upload a flow CSV to unlock the overview, detection, analysis and report views.'}
      </p>
      <Magnetic className="mt-8">
        <Link
          to={running ? `/scan/${jobId}` : '/'}
          className="inline-block rounded-full border border-cyan/60 bg-cyan/10 px-6 py-2.5 text-sm font-semibold text-cyan transition hover:bg-cyan/20 hover:shadow-[0_0_24px_rgb(34_211_238/0.35)]"
        >
          {running ? 'Watch the live scan' : 'Upload network data'}
        </Link>
      </Magnetic>
    </section>
  )
}
