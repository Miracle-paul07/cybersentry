// Below the landing hero: how a scan works, with a thread that draws itself down the
// section as you scroll and lights each stage as it arrives. The wording follows the real
// pipeline, so keep it in step with src/pipeline.py and src/genai_report.py.
import { useEffect, useRef } from 'react'
import { Reveal, glideTo, reducedMotion } from './fx'

const STAGES = [
  {
    title: 'Preprocess',
    tag: '32 features',
    text: 'Your CSV of network flows is cleaned and checked. Rows with missing or infinite values are set aside and counted.',
  },
  {
    title: 'Anomaly detection',
    tag: 'Stage 1 · XGBoost',
    text: 'Every flow gets a score, and the ones that do not look like normal traffic are flagged as suspicious.',
  },
  {
    title: 'Attack classification',
    tag: 'Stage 2 · 1D-CNN',
    text: 'Each flagged flow is given an attack type and a confidence score. Low-confidence flows are marked for a human to review.',
  },
  {
    title: 'Incident report',
    tag: 'Groq · grounding check',
    text: 'An LLM explains the evidence it is given and nothing else, and a grounding check flags any number that is not in that evidence.',
  },
]
const FACTS = [
  ['32', 'Features per flow'],
  ['2', 'Models in sequence'],
  ['12', 'Attack types it can name'],
  ['4', 'Risk levels'],
]
const HEAD_LINE = 0.62 // the thread's tip stays this far down the screen
const WIDE = 768 // px; from here the stages alternate sides and the thread swings between them
const SAMPLES = 240

export default function Pipeline() {
  const root = useRef(null)
  const ghost = useRef(null)
  const thread = useRef(null)
  const head = useRef(null)
  const svg = useRef(null)
  const rows = useRef([])

  useEffect(() => {
    const section = root.current
    const still = reducedMotion()
    let total = 0
    let table = []
    let nodeY = []
    let frame = 0

    const lengthAtDepth = (y) => {
      // Depth only ever grows along the thread, so a binary search finds the point
      let lo = 0
      let hi = table.length - 1
      if (y <= table[lo].y) return 0
      if (y >= table[hi].y) return total
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (table[mid].y < y) lo = mid
        else hi = mid
      }
      const span = table[hi].y - table[lo].y || 1
      return table[lo].at + ((y - table[lo].y) / span) * (table[hi].at - table[lo].at)
    }

    const draw = () => {
      frame = 0
      if (!total) return
      const depth = still ? Infinity : window.innerHeight * HEAD_LINE - section.getBoundingClientRect().top
      const at = lengthAtDepth(depth)
      thread.current.style.strokeDashoffset = total - at
      const tip = thread.current.getPointAtLength(at)
      head.current.setAttribute('cx', tip.x)
      head.current.setAttribute('cy', tip.y)
      head.current.style.opacity = at > 0 && at < total ? 1 : 0
      rows.current.forEach((row, i) => row.toggleAttribute('data-lit', depth >= nodeY[i]))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw)
    }

    const build = () => {
      if (!rows.current.every(Boolean)) return // leaving the page: the rows are already gone
      const w = section.clientWidth
      const h = section.clientHeight
      // offsetLeft/Top ignore the reveal's movement, so the thread always lands on the nodes
      const points = rows.current.map((row) => {
        const node = row.querySelector('.pipe-node')
        let x = node.offsetWidth / 2
        let y = node.offsetHeight / 2
        for (let el = node; el !== section; el = el.offsetParent) {
          x += el.offsetLeft
          y += el.offsetTop
        }
        return { x, y }
      })
      nodeY = points.map((p) => p.y)
      const swing = w >= WIDE ? Math.min(w * 0.2, 220) : 14
      const startY = Math.max(0, points[0].y - 150)
      let d = `M${points[0].x} ${startY} L${points[0].x} ${points[0].y}`
      points.slice(1).forEach((p, i) => {
        const a = points[i]
        const third = (p.y - a.y) / 3
        const side = i % 2 === 0 ? 1 : -1
        d += ` C${a.x + side * swing} ${a.y + third} ${p.x + side * swing} ${p.y - third} ${p.x} ${p.y}`
      })
      const last = points[points.length - 1]
      d += ` L${last.x} ${h}`
      svg.current.setAttribute('viewBox', `0 0 ${w} ${h}`)
      ghost.current.setAttribute('d', d)
      thread.current.setAttribute('d', d)
      total = thread.current.getTotalLength()
      thread.current.style.strokeDasharray = total
      table = Array.from({ length: SAMPLES + 1 }, (_, i) => {
        const at = (total * i) / SAMPLES
        return { at, y: thread.current.getPointAtLength(at).y }
      })
      draw()
    }

    build()
    const resize = new ResizeObserver(build)
    resize.observe(section)
    if (still) return () => resize.disconnect()

    // Only does the work while the section is on screen
    const onScreen = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        window.addEventListener('scroll', schedule, { passive: true })
        schedule()
      } else {
        window.removeEventListener('scroll', schedule)
      }
    })
    onScreen.observe(section)
    return () => {
      resize.disconnect()
      onScreen.disconnect()
      window.removeEventListener('scroll', schedule)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div data-cursor="SCROLL" className="bg-ink/70">
      <div ref={root} className="relative mx-auto max-w-[1560px] overflow-hidden px-6 pt-24 md:pt-36">
        <svg ref={svg} className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
          <path ref={ghost} stroke="var(--color-line)" strokeWidth="1" />
          <path ref={thread} stroke="var(--color-cyan)" strokeWidth="1.5" strokeLinecap="round" />
          <circle ref={head} r="4" fill="var(--color-cyan)" style={{ filter: 'drop-shadow(0 0 6px var(--color-cyan))', opacity: 0 }} />
        </svg>

        <Reveal className="relative pl-8 md:pl-0">
          <p className="num text-[11px] tracking-[0.3em] text-cyan uppercase">[ How it works ]</p>
          <h2 className="mt-4 font-display text-[clamp(3.5rem,11vw,11rem)] leading-[0.88] font-bold uppercase">
            From raw flows
            <br />
            to an <span className="text-cyan">incident report</span>
          </h2>
        </Reveal>

        <Reveal className="relative mt-16 pl-8 md:pl-0">
          <dl data-stagger className="cells grid-cols-2 md:grid-cols-4">
            {FACTS.map(([value, label]) => (
              <div key={label} className="cell">
                <dd className="font-display text-[clamp(3.5rem,7vw,6.5rem)] leading-none font-bold">{value}</dd>
                <dt className="num mt-3 text-[11px] tracking-[0.16em] text-muted uppercase">{label}</dt>
              </div>
            ))}
          </dl>
        </Reveal>

        <ol className="relative mt-32 md:mt-52">
          {STAGES.map((stage, i) => {
            const right = i % 2 === 1
            return (
              <li
                key={stage.title}
                ref={(el) => {
                  rows.current[i] = el
                }}
                className="relative pb-28 pl-8 md:grid md:grid-cols-2 md:gap-32 md:pb-56 md:pl-0"
              >
                <span className="pipe-node top-8 left-0 md:left-1/2" />
                <Reveal className={right ? 'md:col-start-2' : 'md:text-right'}>
                  <p className="pipe-index font-display text-[clamp(6rem,13vw,12rem)] leading-[0.85] font-extrabold">0{i + 1}</p>
                  <h3 className="mt-5 font-display text-[clamp(2.75rem,5vw,4.5rem)] leading-[0.95] font-bold uppercase">{stage.title}</h3>
                  <p className="num mt-3 text-[11px] tracking-[0.18em] text-cyan uppercase">{stage.tag}</p>
                  <p className="mt-4 leading-relaxed text-muted md:text-lg">{stage.text}</p>
                </Reveal>
              </li>
            )
          })}
        </ol>

        <div className="relative pb-20 text-center">
          <button
            type="button"
            data-cursor="UPLOAD"
            onClick={() => glideTo(0)}
            className="final-cta font-display text-[clamp(4rem,14vw,14rem)] leading-[0.9] font-extrabold uppercase"
          >
            Start a scan
          </button>
          <p className="num mt-4 text-[11px] tracking-[0.25em] text-muted uppercase">Back to the upload box</p>
        </div>
      </div>
    </div>
  )
}
