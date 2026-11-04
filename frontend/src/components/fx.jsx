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

// A smooth glide to a position (0 for the top) or an element
export function glideTo(target) {
  if (lenis) lenis.scrollTo(target, { duration: 1.4 })
  else if (typeof target === 'number') window.scrollTo({ top: target, behavior: reducedMotion() ? 'auto' : 'smooth' })
  else target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' })
}

// The landing page's hero waits for the intro to finish, so its big moment isn't hidden
let introOver = true
let waiting = []
export const holdForIntro = () => {
  introOver = false
}
export const finishIntro = () => {
  introOver = true
  waiting.forEach((fn) => fn())
  waiting = []
}
export const afterIntro = (fn) => (introOver ? fn() : waiting.push(fn))

const GLYPHS = '!<>-_/[]{}=+*^?#01'
const SCRAMBLE_STEP = 45 // ms between new random characters, whatever the screen's refresh rate

// Types text out through random characters. Only for monospace text, or the width would jump.
export function scrambleTo(node, text, duration = 0.55) {
  if (reducedMotion()) {
    node.textContent = text
    return null
  }
  const state = { p: 0 }
  let last = 0
  return gsap.to(state, {
    p: 1,
    duration,
    ease: 'none',
    onUpdate: () => {
      const now = performance.now()
      if (now - last < SCRAMBLE_STEP) return
      last = now
      const done = Math.floor(state.p * text.length)
      let out = text.slice(0, done)
      for (let i = done; i < text.length; i++) {
        out += text[i] === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
      }
      node.textContent = out
    },
    onComplete: () => {
      node.textContent = text
    },
  })
}

// Text that scrambles when it first appears (onMount) or when its parent is hovered (hover)
export function Scramble({ text, onMount = false, hover = false, className = '' }) {
  const el = useRef(null)

  useLayoutEffect(() => {
    if (!onMount) return
    const tween = scrambleTo(el.current, text, 0.7)
    return () => tween?.kill()
  }, [onMount, text])

  useEffect(() => {
    if (!hover || !pointerFx()) return
    const node = el.current
    const parent = node.parentElement
    let tween
    const onEnter = () => {
      tween?.kill()
      tween = scrambleTo(node, text, 0.4)
    }
    parent.addEventListener('pointerenter', onEnter)
    return () => {
      parent.removeEventListener('pointerenter', onEnter)
      tween?.kill()
      node.textContent = text
    }
  }, [hover, text])

  return <span ref={el} className={className}>{text}</span>
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

// Targeting reticle in place of the system cursor. The dot is written straight to the
// pointer position with no animation, so it can't trail behind or jitter. The ring follows
// on one steady per-frame easing, which is smooth at any refresh rate. Restarting a tween on
// every pointer event made the speed uneven, which is what the jitter was. The states are
// attributes styled in CSS, so nothing here re-renders React.
const RING_EASE_MS = 55

export function Cursor() {
  const root = useRef(null)
  const dot = useRef(null)
  const ring = useRef(null)
  const label = useRef(null)

  useEffect(() => {
    if (!pointerFx()) return
    const node = root.current
    const place = (el, x, y) => {
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }
    const flag = (name, on) => {
      if (node.hasAttribute(name) !== on) node.toggleAttribute(name, on)
    }
    const pointer = { x: 0, y: 0 }
    const trail = { x: 0, y: 0 }
    let shown = false
    let over = {}
    let hint = null
    document.documentElement.classList.add('has-reticle')

    const follow = (_, deltaMs) => {
      const dx = pointer.x - trail.x
      const dy = pointer.y - trail.y
      if (!shown || (Math.abs(dx) < 0.02 && Math.abs(dy) < 0.02)) return
      const k = 1 - Math.exp(-deltaMs / RING_EASE_MS)
      trail.x += dx * k
      trail.y += dy * k
      place(ring.current, trail.x, trail.y)
    }
    gsap.ticker.add(follow)

    const paint = () => {
      const s = hint ?? over
      flag('data-native', Boolean(s.native))
      flag('data-active', Boolean(s.active))
      flag('data-threat', Boolean(s.threat))
      if (label.current.textContent !== (s.label ?? '')) label.current.textContent = s.label ?? ''
    }
    const moveTo = (x, y) => {
      pointer.x = x
      pointer.y = y
      place(dot.current, x, y)
      if (!shown) {
        // Coming back into the window starts at the pointer instead of flying in from the old spot
        trail.x = x
        trail.y = y
        place(ring.current, x, y)
        shown = true
      }
      flag('data-visible', true)
      flag('data-flip', x > window.innerWidth - LABEL_ROOM)
    }
    const read = (target) => {
      if (target.tagName !== 'CANVAS') hint = null
      over = reticleFor(target)
      paint()
    }

    const onMove = (e) => e.pointerType !== 'touch' && moveTo(e.clientX, e.clientY)
    const onOver = (e) => {
      if (e.pointerType === 'touch') return
      moveTo(e.clientX, e.clientY)
      read(e.target)
    }
    const onDown = (e) => {
      if (e.pointerType === 'touch') return
      moveTo(e.clientX, e.clientY)
      flag('data-pressed', true)
    }
    const onUp = () => flag('data-pressed', false)
    const onLeave = () => {
      shown = false
      flag('data-visible', false)
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
      gsap.ticker.remove(follow)
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
          {/* A dark edge keeps a red reticle visible over red chart marks, and a wide faint
              stroke is the glow. Real strokes, because a filter here is costly to redraw. */}
          <g className="reticle-edge">
            <circle cx="22" cy="22" r="13" />
            <path d="M22 3v6M22 35v6M3 22h6M35 22h6" />
          </g>
          <circle className="reticle-glow" cx="22" cy="22" r="13" />
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

// The outer span never moves, so it gives a steady hit area and position to measure from.
// Measuring the moving part fed its own movement back in, which made buttons shake.
export function Magnetic({ children, strength = 0.3, className = '' }) {
  const outer = useRef(null)
  const inner = useRef(null)

  useEffect(() => {
    if (!pointerFx()) return
    const node = outer.current
    const x = gsap.quickTo(inner.current, 'x', { duration: 0.4, ease: 'power3.out' })
    const y = gsap.quickTo(inner.current, 'y', { duration: 0.4, ease: 'power3.out' })
    let rect = null
    const onEnter = () => {
      rect = node.getBoundingClientRect()
    }
    const onMove = (e) => {
      rect ??= node.getBoundingClientRect()
      x((e.clientX - rect.left - rect.width / 2) * strength)
      y((e.clientY - rect.top - rect.height / 2) * strength)
    }
    const onLeave = () => {
      rect = null
      x(0)
      y(0)
    }
    node.addEventListener('pointerenter', onEnter)
    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)
    return () => {
      node.removeEventListener('pointerenter', onEnter)
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
    }
  }, [strength])

  return (
    <span ref={outer} className={`inline-block ${className}`}>
      <span ref={inner} className="inline-block">
        {children}
      </span>
    </span>
  )
}

export function TiltCard({ as: Tag = 'div', max = 5, className = '', children, ...props }) {
  const el = useRef(null)

  useEffect(() => {
    if (!pointerFx()) return
    const node = el.current
    let rx = null
    let ry = null
    let rect = null // measured once per hover: the card's own tilt would change it
    const onMove = (e) => {
      // GSAP copies any CSS `translate` into its transform for good the first time it touches
      // an element, so it has to wait until a Reveal on this card has finished.
      if (node.classList.contains('rv')) return
      if (!rx) {
        gsap.set(node, { transformPerspective: 800 })
        rx = gsap.quickTo(node, 'rotationX', { duration: 0.4, ease: 'power3.out' })
        ry = gsap.quickTo(node, 'rotationY', { duration: 0.4, ease: 'power3.out' })
      }
      rect ??= node.getBoundingClientRect()
      const r = rect
      const px = (e.clientX - r.left) / r.width
      const py = (e.clientY - r.top) / r.height
      ry((px - 0.5) * 2 * max)
      rx((0.5 - py) * 2 * max)
      node.style.setProperty('--mx', `${px * 100}%`)
      node.style.setProperty('--my', `${py * 100}%`)
    }
    const onLeave = () => {
      rect = null
      rx?.(0)
      ry?.(0)
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

const REVEAL_CLEANUP_MS = 1600

// Brings its direct children in as they scroll into view. A child marked data-stagger brings
// its own children in one by one instead. This is CSS on the separate `translate` property,
// so while it runs nothing else may start GSAP on the same element (see TiltCard).
export function Reveal({ as: Tag = 'div', className = '', children, ...props }) {
  const el = useRef(null)

  useLayoutEffect(() => {
    if (reducedMotion()) return
    const items = [...el.current.children].flatMap((c) => (c.hasAttribute('data-stagger') ? [...c.children] : [c]))
    const timers = []
    items.forEach((item) => item.classList.add('rv'))

    const observer = new IntersectionObserver(
      (entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .forEach((entry, i) => {
            const item = entry.target
            observer.unobserve(item)
            item.style.setProperty('--rv-i', i)
            item.setAttribute('data-in', '')
            // Done: hand transitions back, so hover colours on the item keep working
            timers.push(
              setTimeout(() => {
                item.classList.remove('rv')
                item.removeAttribute('data-in')
                item.style.removeProperty('--rv-i')
              }, REVEAL_CLEANUP_MS),
            )
          })
      },
      { rootMargin: '0px 0px -5% 0px' },
    )
    items.forEach((item) => observer.observe(item))
    return () => {
      observer.disconnect()
      timers.forEach(clearTimeout)
      items.forEach((item) => {
        item.classList.remove('rv')
        item.removeAttribute('data-in')
      })
    }
  }, [])

  return (
    <Tag ref={el} className={className} {...props}>
      {children}
    </Tag>
  )
}
