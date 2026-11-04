// The full-screen wipe between pages, and the short intro on the first visit in a tab.
// Everything moves with transforms only, so it stays smooth while the next page loads.
import { useImperativeHandle, useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { finishIntro, holdForIntro, reducedMotion, scrambleTo } from './fx'

const COLUMNS = 6
const INTRO_KEY = 'cybersentry.intro'
const WORD = 'CyberSentry'
const TAG = 'Network threat analysis'
const COVER_S = 0.38
const STAGGER_S = 0.025
const HOLD_S = 0.08
// If the browser stops drawing (a background tab, say), navigation must still happen
const GIVE_UP_MS = 1100

const PAGE_LABELS = {
  home: ['[ 00 ]', 'Upload'],
  scan: ['[ -- ]', 'Live scan'],
  overview: ['[ 01 ]', 'Overview'],
  detection: ['[ 02 ]', 'Detection'],
  analysis: ['[ 03 ]', 'Analysis'],
  reports: ['[ 04 ]', 'Reports'],
  evaluation: ['[ 05 ]', 'Evaluation'],
}

function introNeeded() {
  if (reducedMotion() || window.location.pathname !== '/') return false
  try {
    if (sessionStorage.getItem(INTRO_KEY)) return false
    sessionStorage.setItem(INTRO_KEY, '1')
    return true
  } catch {
    return false // storage blocked: skip it rather than replay it on every load
  }
}

const PLAY_INTRO = introNeeded()
if (PLAY_INTRO) holdForIntro()

export default function Shutter({ ref }) {
  const root = useRef(null)
  const cols = useRef([])
  const label = useRef(null)
  const index = useRef(null)
  const name = useRef(null)
  const intro = useRef(null)
  const state = useRef({ phase: 'idle', timeline: null, onCovered: null, giveUp: null })

  const uncover = () => {
    const s = state.current
    s.phase = 'uncovering'
    s.timeline = gsap
      .timeline({
        onComplete: () => {
          gsap.set(root.current, { visibility: 'hidden' })
          gsap.set(cols.current, { yPercent: 100 })
          s.phase = 'idle'
        },
      })
      .to(label.current, { opacity: 0, duration: 0.15 }, HOLD_S)
      .to(cols.current, { yPercent: -100, duration: COVER_S, ease: 'power4.inOut', stagger: STAGGER_S }, HOLD_S)
  }

  useImperativeHandle(ref, () => ({
    // Slides the columns over the screen, calls onCovered while it is hidden, slides them away
    cover(page, onCovered) {
      const s = state.current
      s.onCovered = onCovered
      const [number, title] = PAGE_LABELS[page] ?? ['', '']
      if (s.phase === 'covering') {
        // Already on its way: it just lands on the newer page
        index.current.textContent = number
        name.current.textContent = title
        return
      }
      s.timeline?.kill()
      s.phase = 'covering'
      index.current.textContent = number
      name.current.textContent = title
      const finish = () => {
        clearTimeout(s.giveUp)
        if (s.phase !== 'covering') return
        s.onCovered()
        uncover()
      }
      s.giveUp = setTimeout(() => {
        s.timeline?.kill()
        gsap.set(root.current, { visibility: 'hidden' })
        gsap.set(cols.current, { yPercent: 100 })
        s.phase = 'idle'
        s.onCovered()
      }, GIVE_UP_MS)
      gsap.set(root.current, { visibility: 'visible' })
      s.timeline = gsap
        .timeline({ onComplete: finish })
        .to(cols.current, { yPercent: 0, duration: COVER_S, ease: 'power4.inOut', stagger: STAGGER_S })
        .set(label.current, { opacity: 1 }, COVER_S * 0.72)
        .fromTo(name.current, { yPercent: 110 }, { yPercent: 0, duration: 0.32, ease: 'power4.out' }, COVER_S * 0.72)
        .add(() => scrambleTo(index.current, number, 0.3), COVER_S * 0.72)
    },
  }))

  useLayoutEffect(() => {
    const s = state.current
    if (!PLAY_INTRO) {
      gsap.set(cols.current, { yPercent: 100 })
      return
    }
    // The first paint is already covered, so the upload page never flashes before the intro
    gsap.set(root.current, { visibility: 'visible' })
    gsap.set(cols.current, { yPercent: 0 })
    const finish = () => {
      clearTimeout(s.giveUp)
      gsap.set(intro.current, { autoAlpha: 0 })
      finishIntro()
      uncover()
    }
    const q = gsap.utils.selector(intro.current)
    const lines = q('.intro-line')
    lines.forEach((line) => {
      const length = line.getTotalLength()
      gsap.set(line, { strokeDasharray: length, strokeDashoffset: length })
    })
    s.timeline = gsap
      .timeline({ onComplete: finish })
      .to(lines, { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut', stagger: 0.05 })
      .to(q('.intro-dot'), { scale: 1, duration: 0.3, ease: 'back.out(3)' }, 0.5)
      .from(q('.intro-char'), { yPercent: 115, duration: 0.7, ease: 'power4.out', stagger: 0.03 }, 0.15)
      .add(() => scrambleTo(q('.intro-tag')[0], TAG, 0.55), 0.55)
      .to(q('.intro-mark'), { rotate: 45, duration: 0.5, ease: 'power3.inOut' }, 1.0)
      .to({}, { duration: 0.1 })
    s.giveUp = setTimeout(() => {
      s.timeline.kill()
      finish()
    }, 3000)
    return () => {
      clearTimeout(s.giveUp)
      s.timeline?.kill()
    }
  }, [])

  return (
    <div ref={root} className="shutter" aria-hidden="true">
      <div className="shutter-cols">
        {Array.from({ length: COLUMNS }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              cols.current[i] = el
            }}
            className="shutter-col"
          />
        ))}
      </div>
      <div ref={label} className="shutter-label">
        <span ref={index} className="shutter-index" />
        <span className="shutter-mask">
          <span ref={name} className="shutter-name" />
        </span>
      </div>
      {PLAY_INTRO && (
        <div ref={intro} className="intro">
          <svg viewBox="0 0 44 44" className="intro-mark" fill="none" stroke="currentColor" strokeWidth="1">
            <circle className="intro-line" cx="22" cy="22" r="13" />
            <path className="intro-line" d="M22 3v6" />
            <path className="intro-line" d="M22 35v6" />
            <path className="intro-line" d="M3 22h6" />
            <path className="intro-line" d="M35 22h6" />
            <circle className="intro-dot" cx="22" cy="22" r="2" fill="currentColor" stroke="none" style={{ transform: 'scale(0)', transformOrigin: 'center' }} />
          </svg>
          <div className="intro-word">
            {[...WORD].map((c, i) => (
              <span key={i} className={`intro-char inline-block ${i >= 5 ? 'text-cyan' : ''}`}>
                {c}
              </span>
            ))}
          </div>
          <span className="intro-tag">{' '.repeat(TAG.length)}</span>
        </div>
      )}
    </div>
  )
}
