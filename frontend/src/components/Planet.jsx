// The landing page background: a slowly turning planet drawn as dithered dots, lit from
// the pointer's side, with red pulses spreading across it. It is decoration, not real traffic.
//
// Performance: one shader on a canvas of one pixel per dot, scaled up, so it costs very
// little at any screen size. It draws at 30fps at most, which leaves the main thread free for
// the cursor, stops while the tab is hidden, and draws one still frame for reduced motion.
import { useEffect, useRef } from 'react'
import { reducedMotion } from './fx'

const CELL = 4 // css px per dot. Must match the dot grid in .planet::after
const FRAME_MS = 1000 / 30

const VERTEX = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPointer;
uniform float uScroll;

float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  return noise(p) * 0.55 + noise(p * 2.03) * 0.28 + noise(p * 4.1) * 0.17;
}

vec3 turn(vec3 n, float t) {
  float cx = cos(0.38), sx = sin(0.38);
  n = vec3(n.x, cx * n.y - sx * n.z, sx * n.y + cx * n.z);
  float cy = cos(t), sy = sin(t);
  return vec3(cy * n.x + sy * n.z, n.y, -sy * n.x + cy * n.z);
}

void main() {
  vec2 c = gl_FragCoord.xy;
  float radius = 0.43 * min(uRes.x, uRes.y) * (1.0 + uScroll * 0.55);
  vec2 centre = vec2(0.5 * uRes.x, (0.52 - uScroll * 0.1) * uRes.y);
  vec2 p = (c - centre) / radius;
  float r2 = dot(p, p);
  float dim = 1.0 - uScroll * 0.72;
  float threshold = bayer8(c);
  vec3 light = normalize(vec3(uPointer * 1.15 + vec2(-0.35, 0.3), 0.72));

  vec3 colour = vec3(0.0);
  float alpha = 0.0;

  if (r2 < 1.0) {
    vec3 n = vec3(p, sqrt(1.0 - r2));
    vec3 m = turn(n, uTime * 0.06);
    float land = smoothstep(0.47, 0.6, fbm(m * 2.3));
    float shade = max(dot(n, light), 0.0) * (0.1 + 0.9 * land);
    shade += pow(1.0 - n.z, 3.0) * 0.22;
    shade *= dim * 0.72;

    if (shade > threshold) {
      colour = mix(vec3(0.03, 0.34, 0.44), vec3(0.3, 0.8, 0.92), smoothstep(0.25, 0.72, shade));
      alpha = 1.0;
    }

    // Pulses that spread out from a few points on the surface
    for (int i = 0; i < 5; i++) {
      float k = float(i);
      vec3 h = normalize(vec3(sin(k * 2.4 + 0.6), cos(k * 1.7 + 0.4), sin(k * 3.1 + 1.2)));
      float angle = acos(clamp(dot(m, h), -1.0, 1.0));
      float age = fract(uTime * 0.16 + k * 0.23);
      float ring = 1.0 - smoothstep(0.0, 0.035, abs(angle - age * 0.42));
      float heat = (ring * (1.0 - age) + (1.0 - smoothstep(0.0, 0.05, angle))) * step(0.02, n.z) * dim;
      if (heat > threshold * 0.9) {
        colour = vec3(0.95, 0.15, 0.3);
        alpha = 1.0;
      }
    }
  } else {
    // Thin atmosphere, then scattered stars
    float d = sqrt(r2) - 1.0;
    float side = max(dot(normalize(vec3(p, 0.0)), light) + 0.35, 0.0);
    float glow = exp(-d * 14.0) * 0.7 * side * dim - 0.04; // the offset stops it speckling the whole page
    if (glow > threshold) {
      colour = vec3(0.05, 0.42, 0.55);
      alpha = 1.0;
    } else if (hash(vec3(floor(c), 1.0)) > 0.9985) {
      colour = vec3(0.45, 0.58, 0.72) * (0.45 + 0.35 * sin(uTime + c.x));
      alpha = 1.0;
    }
  }
  gl_FragColor = vec4(colour * alpha, alpha);
}
`

function compile(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return shader
}

export default function Planet() {
  const canvas = useRef(null)

  useEffect(() => {
    const node = canvas.current
    const gl = node.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' })
    if (!gl) return // no WebGL: the page just has its plain background

    const program = gl.createProgram()
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.bindAttribLocation(program, 0, 'a')
    gl.vertexAttribPointer(gl.getAttribLocation(program, 'a'), 2, gl.FLOAT, false, 0, 0)

    const u = {
      res: gl.getUniformLocation(program, 'uRes'),
      time: gl.getUniformLocation(program, 'uTime'),
      pointer: gl.getUniformLocation(program, 'uPointer'),
      scroll: gl.getUniformLocation(program, 'uScroll'),
    }

    const still = reducedMotion()
    const target = { x: 0, y: 0 }
    const eased = { x: 0, y: 0 }

    const draw = (now) => {
      gl.uniform1f(u.time, now / 1000)
      gl.uniform2f(u.pointer, eased.x, eased.y)
      gl.uniform1f(u.scroll, Math.min(window.scrollY / (window.innerHeight * 1.4), 1))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const resize = () => {
      const cols = Math.ceil(window.innerWidth / CELL)
      const rows = Math.ceil(window.innerHeight / CELL)
      node.width = cols
      node.height = rows
      node.style.width = `${cols * CELL}px`
      node.style.height = `${rows * CELL}px`
      gl.viewport(0, 0, cols, rows)
      gl.uniform2f(u.res, cols, rows)
      if (still) draw(0)
    }
    resize()
    window.addEventListener('resize', resize)
    if (still) return () => window.removeEventListener('resize', resize)

    const onMove = (e) => {
      target.x = (e.clientX / window.innerWidth) * 2 - 1
      target.y = 1 - (e.clientY / window.innerHeight) * 2
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    let raf
    let last = 0
    const tick = (now) => {
      raf = requestAnimationFrame(tick)
      if (document.hidden || now - last < FRAME_MS - 2) return
      const k = 1 - Math.exp(-(now - last) / 300)
      last = now
      eased.x += (target.x - eased.x) * k
      eased.y += (target.y - eased.y) * k
      draw(now)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return (
    <div className="planet" aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  )
}
