// Shared motion effects. All of them switch off for prefers-reduced-motion, and
// the pointer-driven ones also switch off on touch screens.
import { useEffect, useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { fmt } from '../risk'

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
export const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches
const pointerFx = () => finePointer() && !reducedMotion()

let lenis = null

export function SmoothScroll() {
  useEffect(() => {
    if (reducedMotion()) return
    lenis = new Lenis({ autoRaf: true, duration: 0.9 })
    return () => {
      lenis.destroy()
      lenis = null
    }
  }, [])
  return null
}

export function scrollToTop() {
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true })
  else window.scrollTo(0, 0)
}

const NATIVE_CURSOR = 'input:not([type="checkbox"], [type="radio"], [type="file"]), select, textarea'
const CLICKABLE = 'a, button, label, input, [role="button"], tr[tabindex]'
const LABEL_ROOM = 200 // px; closer to the right edge than this, the label flips left

// What the reticle should show over an element. Pages tag elements with data-cursor
// (label) and data-threat (turns it red); the rest follows from the element itself.
function reticleFor(el) {
  if (el.closest(NATIVE_CURSOR)) return { native: true }
  const threat = Boolean(el.closest('[data-threat]'))
  const hit = el.closest(CLICKABLE)
  if (hit?.matches(':disabled, [aria-disabled="true"]')) return { threat }
  if (hit) {
    const named = hit.matches('a, button, [role="button"]') ? 'OPEN' : ''
    const label = hit.dataset.cursor ?? (hit.matches('[download]') ? 'DOWNLOAD' : hit.matches('tr') ? 'INSPECT' : named)
    return { active: true, threat, label }
  }
  if (el.closest('tbody tr') && !el.closest('td[colspan]')) return { threat, label: 'INSPECT' }
  return { threat, label: el.closest('[data-cursor]')?.dataset.cursor ?? '' }
}

// Charts draw on a canvas, so they report what's under the pointer themselves
let chartHint = () => {}
export const setChartHint = (hint) => chartHint(hint)

// Targeting reticle in place of the system cursor. Only position goes through GSAP;
// its states are attributes styled in CSS, so nothing here re-renders React.
export function Cursor() {
  const root = useRef(null)
  const dot = useRef(null)
  const ring = useRef(null)
  const label = useRef(null)

  useEffect(() => {
    if (!pointerFx()) return
    const node = root.current
    const moveDot = { x: gsap.quickTo(dot.current, 'x', { duration: 0.08 }), y: gsap.quickTo(dot.current, 'y', { duration: 0.08 }) }
    const moveRing = { x: gsap.quickTo(ring.current, 'x', { duration: 0.35 }), y: gsap.quickTo(ring.current, 'y', { duration: 0.35 }) }
    let shown = false
    let over = {}
    let hint = null
    document.documentElement.classList.add('has-reticle')

    const paint = () => {
      const s = hint ?? over
      node.toggleAttribute('data-native', Boolean(s.native))
      node.toggleAttribute('data-active', Boolean(s.active))
      node.toggleAttribute('data-threat', Boolean(s.threat))
      if (label.current.textContent !== (s.label ?? '')) label.current.textContent = s.label ?? ''
    }
    const place = (x, y) => {
      // Coming back into the window starts at the pointer instead of flying in from the old spot
      const from = (v) => (shown ? undefined : v)
      moveDot.x(x, from(x))
      moveDot.y(y, from(y))
      moveRing.x(x, from(x))
      moveRing.y(y, from(y))
      shown = true
      node.toggleAttribute('data-visible', true)
      node.toggleAttribute('data-flip', x > window.innerWidth - LABEL_ROOM)
    }
    const read = (target) => {
      if (target.tagName !== 'CANVAS') hint = null
      over = reticleFor(target)
      paint()
    }

    const onMove = (e) => e.pointerType !== 'touch' && place(e.clientX, e.clientY)
    const onOver = (e) => {
      if (e.pointerType === 'touch') return
      place(e.clientX, e.clientY)
      read(e.target)
    }
    const onDown = (e) => {
      if (e.pointerType === 'touch') return
      place(e.clientX, e.clientY)
      node.toggleAttribute('data-pressed', true)
    }
    const onUp = () => node.toggleAttribute('data-pressed', false)
    const onLeave = () => {
      shown = false
      node.toggleAttribute('data-visible', false)
    }
    chartHint = (next) => {
      hint = next
      paint()
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', onUp, { passive: true })
    window.addEventListener('dragover', onOver, { passive: true }) // a file dragged in sends no pointer events
    document.addEventListener('pointerover', onOver, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      chartHint = () => {}
      document.documentElement.classList.remove('has-reticle')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('dragover', onOver)
      document.removeEventListener('pointerover', onOver)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div ref={root} className="reticle" aria-hidden="true">
      <div ref={ring} className="reticle-anchor">
        <svg viewBox="0 0 44 44" className="reticle-ring" fill="none" stroke="currentColor">
          <circle cx="22" cy="22" r="13" />
          <path d="M22 3v6M22 35v6M3 22h6M35 22h6" />
        </svg>
      </div>
      <div ref={dot} className="reticle-anchor">
        <span className="reticle-dot" />
        <span ref={label} className="reticle-label" />
      </div>
    </div>
  )
}

// Number that counts up to its value, and counts on from there when it changes
export function CountUp({ value, format = (v) => fmt(Math.round(v)), duration = 1.1 }) {
  const el = useRef(null)
  const shown = useRef(0)

  useLayoutEffect(() => {
    const node = el.current
    if (reducedMotion()) {
      shown.current = value
      node.textContent = format(value)
      return
    }
    const state = { v: shown.current }
    node.textContent = format(state.v)
    const tween = gsap.to(state, {
      v: value,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        shown.current = state.v
        node.textContent = format(state.v)
      },
      onComplete: () => {
        shown.current = value
        node.textContent = format(value)
      },
    })
    return () => tween.kill()
    // format is usually an inline function; only a new value should restart the count
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration])

  return <span ref={el} />
}

export function Magnetic({ children, strength = 0.3, className = '' }) {
  const el = useRef(null)

  useEffect(() => {
    if (!pointerFx()) return
    const node = el.current
    const x = gsap.quickTo(node, 'x', { duration: 0.4, ease: 'power3.out' })
    const y = gsap.quickTo(node, 'y', { duration: 0.4, ease: 'power3.out' })
    const onMove = (e) => {
      const r = node.getBoundingClientRect()
      x((e.clientX - r.left - r.width / 2) * strength)
      y((e.clientY - r.top - r.height / 2) * strength)
    }
    const onLeave = () => {
      x(0)
      y(0)
    }
    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)
    return () => {
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
    }
  }, [strength])

  return (
    <span ref={el} className={`inline-block ${className}`}>
      {children}
    </span>
  )
}

export function TiltCard({ as: Tag = 'div', max = 5, className = '', children, ...props }) {
  const el = useRef(null)

  useEffect(() => {
    if (!pointerFx()) return
    const node = el.current
    gsap.set(node, { transformPerspective: 800 })
    const rx = gsap.quickTo(node, 'rotationX', { duration: 0.4, ease: 'power3.out' })
    const ry = gsap.quickTo(node, 'rotationY', { duration: 0.4, ease: 'power3.out' })
    const onMove = (e) => {
      const r = node.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width
      const py = (e.clientY - r.top) / r.height
      ry((px - 0.5) * 2 * max)
      rx((0.5 - py) * 2 * max)
      node.style.setProperty('--mx', `${px * 100}%`)
      node.style.setProperty('--my', `${py * 100}%`)
    }
    const onLeave = () => {
      rx(0)
      ry(0)
    }
    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)
    return () => {
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
    }
  }, [max])

  return (
    <Tag ref={el} className={`tilt ${className}`} {...props}>
      {children}
    </Tag>
  )
}

// Fades its direct children in one after another when it first appears
export function Reveal({ as: Tag = 'div', className = '', children, ...props }) {
  const el = useRef(null)

  useLayoutEffect(() => {
    if (reducedMotion()) return
    const ctx = gsap.context(() => {
      gsap.from(el.current.children, {
        opacity: 0,
        y: 14,
        duration: 0.45,
        stagger: 0.05,
        ease: 'power2.out',
        clearProps: 'opacity,transform',
      })
    }, el)
    return () => ctx.revert()
  }, [])

  return (
    <Tag ref={el} className={className} {...props}>
      {children}
    </Tag>
  )
}
