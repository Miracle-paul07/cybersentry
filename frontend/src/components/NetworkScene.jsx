// Full-screen 3D network: glowing nodes and links that lean away from the pointer,
// with red "threat" pulses travelling along the links.
//
// Performance: renders on demand at no more than 60fps, stops while the tab is
// hidden, draws one frame only for prefers-reduced-motion, and drops to fewer
// nodes and a lower resolution on slow machines.
import { Component, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import { reducedMotion } from './fx'

const FRAME_MS = 1000 / 60
const QUALITY = {
  high: { nodes: 140, pulses: 12, dpr: [1, 1.5] },
  low: { nodes: 70, pulses: 5, dpr: 1 },
}
const POINTER_RADIUS = 2.6
const POINTER_PUSH = 0.9
const TRAIL = [1, 0.5, 0.25, 0.1] // brightness of a pulse's head and trail

const CYAN = new THREE.Color('#22d3ee')
const RED = new THREE.Color('#e11d48')

function slowMachine() {
  const few = (navigator.hardwareConcurrency ?? 8) <= 4
  const small = (navigator.deviceMemory ?? 8) <= 4
  return few || small || window.matchMedia('(pointer: coarse)').matches
}

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

// Seeded, so the network looks the same on every load
function buildGraph(count) {
  let seed = 7
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }

  const base = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    base[i * 3] = (random() * 2 - 1) * 10
    base[i * 3 + 1] = (random() * 2 - 1) * 5.6
    base[i * 3 + 2] = (random() * 2 - 1) * 4
  }

  // Link each node to its nearest neighbours
  const seen = new Set()
  const links = []
  const adjacency = Array.from({ length: count }, () => [])
  for (let i = 0; i < count; i++) {
    const nearest = []
    for (let j = 0; j < count; j++) {
      if (i === j) continue
      const dx = base[i * 3] - base[j * 3]
      const dy = base[i * 3 + 1] - base[j * 3 + 1]
      const dz = base[i * 3 + 2] - base[j * 3 + 2]
      nearest.push([dx * dx + dy * dy + dz * dz, j])
    }
    nearest.sort((a, b) => a[0] - b[0])
    for (const [, j] of nearest.slice(0, 3)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`
      if (seen.has(key)) continue
      seen.add(key)
      adjacency[i].push(links.length)
      adjacency[j].push(links.length)
      links.push([i, j])
    }
  }
  return { base, links, adjacency }
}

function glowTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.65)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function Network({ quality, still }) {
  const { nodes: nodeCount, pulses: pulseCount } = QUALITY[quality]
  const group = useRef(null)
  const pointer = useRef(null) // last pointer position, -1..1. Null until it moves.
  const smooth = useRef({ x: 0, y: 0 })

  const graph = useMemo(() => buildGraph(nodeCount), [nodeCount])
  const glow = useMemo(glowTexture, [])
  useEffect(() => () => glow.dispose(), [glow])

  const buffers = useMemo(() => {
    const { base, links } = graph
    const brightness = new Float32Array(nodeCount)
    for (let i = 0; i < nodeCount; i++) brightness[i] = 0.4 + 0.6 * ((base[i * 3 + 2] + 4) / 8) // far nodes are dimmer
    return {
      nodePos: base.slice(),
      nodeColor: new Float32Array(nodeCount * 3),
      linkPos: new Float32Array(links.length * 6),
      linkColor: new Float32Array(links.length * 6),
      pulsePos: new Float32Array(pulseCount * TRAIL.length * 3),
      pulseColor: new Float32Array(pulseCount * TRAIL.length * 3),
      brightness,
      nodeHeat: new Float32Array(nodeCount), // red flash when a pulse arrives
      linkHeat: new Float32Array(links.length),
    }
  }, [graph, nodeCount, pulseCount])

  const pulses = useMemo(() => {
    const list = []
    for (let i = 0; i < pulseCount; i++) {
      list.push({
        link: Math.floor(((i * 7919) % 997) / 997 * graph.links.length),
        forward: i % 2 === 0,
        t: (i * 0.37) % 1,
        speed: 0.35 + ((i * 13) % 10) * 0.04,
      })
    }
    return list
  }, [graph, pulseCount])

  const nodePoints = useRef(null)
  const linkLines = useRef(null)
  const pulsePoints = useRef(null)

  useEffect(() => {
    if (still) return
    const onMove = (e) => {
      pointer.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: -(e.clientY / window.innerHeight) * 2 + 1 }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [still])

  // Fill the colours and link positions once, for the still frame and the first frame
  useEffect(() => {
    writeLinks()
    writeColors(new Float32Array(nodeCount))
    markDirty()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffers])

  function markDirty() {
    const geometry = (r) => r.current?.geometry.attributes
    const n = geometry(nodePoints)
    const l = geometry(linkLines)
    const p = geometry(pulsePoints)
    if (n) n.position.needsUpdate = n.color.needsUpdate = true
    if (l) l.position.needsUpdate = l.color.needsUpdate = true
    if (p) p.position.needsUpdate = p.color.needsUpdate = true
  }

  function writeLinks() {
    const { nodePos, linkPos, linkColor, linkHeat } = buffers
    graph.links.forEach(([a, b], i) => {
      const o = i * 6
      linkPos[o] = nodePos[a * 3]
      linkPos[o + 1] = nodePos[a * 3 + 1]
      linkPos[o + 2] = nodePos[a * 3 + 2]
      linkPos[o + 3] = nodePos[b * 3]
      linkPos[o + 4] = nodePos[b * 3 + 1]
      linkPos[o + 5] = nodePos[b * 3 + 2]
      const h = linkHeat[i]
      const r = CYAN.r * 0.14 * (1 - h) + RED.r * 0.75 * h
      const g = CYAN.g * 0.14 * (1 - h) + RED.g * 0.75 * h
      const bl = CYAN.b * 0.14 * (1 - h) + RED.b * 0.75 * h
      linkColor[o] = linkColor[o + 3] = r
      linkColor[o + 1] = linkColor[o + 4] = g
      linkColor[o + 2] = linkColor[o + 5] = bl
    })
  }

  function writeColors(hover) {
    const { nodeColor, brightness, nodeHeat } = buffers
    for (let i = 0; i < nodeCount; i++) {
      const h = nodeHeat[i]
      const light = brightness[i] * (1 + hover[i] * 1.4)
      nodeColor[i * 3] = CYAN.r * light * (1 - h) + RED.r * 1.6 * h
      nodeColor[i * 3 + 1] = CYAN.g * light * (1 - h) + RED.g * 1.6 * h
      nodeColor[i * 3 + 2] = CYAN.b * light * (1 - h) + RED.b * 1.6 * h
    }
  }

  const scratch = useMemo(
    () => ({ world: new THREE.Vector3(), dir: new THREE.Vector3(), hover: new Float32Array(nodeCount) }),
    [nodeCount],
  )

  useFrame((state, rawDelta) => {
    if (still) return
    const dt = Math.min(rawDelta, 0.05) // no jump after the tab was hidden
    const t = state.clock.elapsedTime
    const { nodePos, nodeHeat, linkHeat, pulsePos, pulseColor } = buffers
    const { base, links, adjacency } = graph

    // Gentle drift, plus a lean toward the pointer
    const ease = 1 - Math.exp(-dt * 3)
    smooth.current.x += ((pointer.current?.x ?? 0) - smooth.current.x) * ease
    smooth.current.y += ((pointer.current?.y ?? 0) - smooth.current.y) * ease
    group.current.rotation.y = Math.sin(t * 0.05) * 0.12 + smooth.current.x * 0.16
    group.current.rotation.x = Math.cos(t * 0.04) * 0.05 - smooth.current.y * 0.09
    group.current.updateMatrixWorld()

    // Pointer position in the network's own space (null until the pointer moves)
    let px = null
    let py = null
    if (pointer.current) {
      const { world, dir } = scratch
      dir.set(pointer.current.x, pointer.current.y, 0.5).unproject(state.camera).sub(state.camera.position).normalize()
      world.copy(state.camera.position).addScaledVector(dir, -state.camera.position.z / dir.z)
      group.current.worldToLocal(world)
      px = world.x
      py = world.y
    }

    // Nodes near the pointer move away from it and brighten
    const follow = 1 - Math.exp(-dt * 6)
    const { hover } = scratch
    for (let i = 0; i < nodeCount; i++) {
      const bx = base[i * 3]
      const by = base[i * 3 + 1]
      let tx = bx
      let ty = by
      let force = 0
      if (px !== null) {
        const dx = bx - px
        const dy = by - py
        const d = Math.hypot(dx, dy) || 1
        force = Math.exp(-(d * d) / (POINTER_RADIUS * POINTER_RADIUS))
        tx += (dx / d) * force * POINTER_PUSH
        ty += (dy / d) * force * POINTER_PUSH
      }
      hover[i] += (force - hover[i]) * follow
      nodePos[i * 3] += (tx - nodePos[i * 3]) * follow
      nodePos[i * 3 + 1] += (ty - nodePos[i * 3 + 1]) * follow
      nodeHeat[i] = Math.max(0, nodeHeat[i] - dt * 1.2)
    }
    for (let i = 0; i < linkHeat.length; i++) linkHeat[i] = Math.max(0, linkHeat[i] - dt * 1.1)

    // Pulses hop from link to link along a path
    pulses.forEach((p, k) => {
      p.t += p.speed * dt
      if (p.t >= 1) {
        const arrived = links[p.link][p.forward ? 1 : 0]
        nodeHeat[arrived] = 1
        const options = adjacency[arrived].filter((l) => l !== p.link)
        const next = options.length ? options[Math.floor(Math.random() * options.length)] : Math.floor(Math.random() * links.length)
        p.forward = links[next][0] === arrived
        p.link = next
        p.t = 0
      }
      linkHeat[p.link] = 1
      const [a, b] = p.forward ? links[p.link] : [links[p.link][1], links[p.link][0]]
      TRAIL.forEach((light, j) => {
        const at = Math.max(0, p.t - j * 0.05)
        const o = (k * TRAIL.length + j) * 3
        for (let c = 0; c < 3; c++) {
          pulsePos[o + c] = nodePos[a * 3 + c] + (nodePos[b * 3 + c] - nodePos[a * 3 + c]) * at
        }
        pulseColor[o] = RED.r * 2 * light
        pulseColor[o + 1] = RED.g * 2 * light
        pulseColor[o + 2] = RED.b * 2 * light
      })
    })

    writeLinks()
    writeColors(hover)
    markDirty()
  })

  return (
    <group ref={group}>
      <lineSegments ref={linkLines} frustumCulled={false}>
        <bufferGeometry key={`l${nodeCount}`}>
          <bufferAttribute attach="attributes-position" args={[buffers.linkPos, 3]} />
          <bufferAttribute attach="attributes-color" args={[buffers.linkColor, 3]} />
        </bufferGeometry>
        <lineBasicMaterial vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </lineSegments>

      <points ref={nodePoints} frustumCulled={false}>
        <bufferGeometry key={`n${nodeCount}`}>
          <bufferAttribute attach="attributes-position" args={[buffers.nodePos, 3]} />
          <bufferAttribute attach="attributes-color" args={[buffers.nodeColor, 3]} />
        </bufferGeometry>
        <pointsMaterial map={glow} size={0.2} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>

      {!still && (
        <points ref={pulsePoints} frustumCulled={false}>
          <bufferGeometry key={`p${nodeCount}`}>
            <bufferAttribute attach="attributes-position" args={[buffers.pulsePos, 3]} />
            <bufferAttribute attach="attributes-color" args={[buffers.pulseColor, 3]} />
          </bufferGeometry>
          <pointsMaterial map={glow} size={0.36} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
      )}
    </group>
  )
}

// Asks for a new frame at no more than 60fps, and only while the tab is visible
function FrameLimiter({ still }) {
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    if (still) {
      invalidate()
      return
    }
    let raf
    let last = 0
    const tick = (now) => {
      raf = requestAnimationFrame(tick)
      if (document.hidden) return
      const elapsed = now - last
      if (elapsed >= FRAME_MS - 2) {
        last = now - Math.max(0, Math.min(elapsed - FRAME_MS, FRAME_MS))
        invalidate()
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [invalidate, still])

  return null
}

// A missing or crashed WebGL driver must not take the upload page down with it
class SceneBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

export default function NetworkScene() {
  const [quality, setQuality] = useState(() => (slowMachine() ? 'low' : 'high'))
  const [still] = useState(reducedMotion)
  const [supported] = useState(webglAvailable)

  if (!supported) return null

  return (
    <SceneBoundary>
      <Canvas
        flat
        frameloop="demand"
        dpr={QUALITY[quality].dpr}
        camera={{ position: [0, 0, 9], fov: 55 }}
        gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        <FrameLimiter still={still} />
        {!still && quality === 'high' && (
          <PerformanceMonitor bounds={() => [40, 75]} onDecline={() => setQuality('low')} />
        )}
        <Network key={quality} quality={quality} still={still} />
      </Canvas>
    </SceneBoundary>
  )
}
