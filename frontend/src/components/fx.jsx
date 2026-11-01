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

export function Cursor() {
  const dot = useRef(null)
  const ring = useRef(null)

  useEffect(() => {
    if (!pointerFx()) return
    const moveDot = { x: gsap.quickTo(dot.current, 'x', { duration: 0.08 }), y: gsap.quickTo(dot.current, 'y', { duration: 0.08 }) }
    const moveRing = { x: gsap.quickTo(ring.current, 'x', { duration: 0.35 }), y: gsap.quickTo(ring.current, 'y', { duration: 0.35 }) }
    const show = (opacity) => gsap.to([dot.current, ring.current], { opacity, duration: 0.2, overwrite: 'auto' })

    const onMove = (e) => {
      if (Number(gsap.getProperty(dot.current, 'opacity')) === 0) show(1)
      moveDot.x(e.clientX)
      moveDot.y(e.clientY)
      moveRing.x(e.clientX)
      moveRing.y(e.clientY)
    }
    const onOver = (e) => {
      const active = e.target.closest?.('a, button, select, input, label, [role="button"], tr[tabindex]')
      gsap.to(ring.current, { scale: active ? 1.6 : 1, duration: 0.25, overwrite: 'auto' })
    }
    const onLeave = () => show(0)

    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerover', onOver, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerover', onOver)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <>
      <div ref={ring} className="cursor-ring" aria-hidden="true" />
      <div ref={dot} className="cursor-dot" aria-hidden="true" />
    </>
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
