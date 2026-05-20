'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import './MobileEnterClient.css'

type Phase = 'idle' | 'expand' | 'dissolve' | 'done'

const EXPAND_END   = 1200
const DISSOLVE_END = 2000
const TOTAL        = DISSOLVE_END + 200

interface Blob {
  phase: number; speed: number
  r: number
  c0: string; c1: string
  driftX: number; driftY: number; breath: number
}

interface Wisp {
  phase: number; freqX: number; freqY: number
  radius: number; baseX: number; baseY: number
  driftAmp: number; opacity: number; size: number; color: string
}

function drawBlob(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, baseRadius: number,
  t: number, blob: Blob
) {
  const N = 6
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 1.1)
  g.addColorStop(0, blob.c0)
  g.addColorStop(0.5, blob.c1)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.beginPath()
  for (let i = 0; i <= N; i++) {
    const angle = (i / N) * Math.PI * 2
    const r = baseRadius * (
      1
      + 0.22 * Math.sin(t * 0.53 * blob.speed + blob.phase + angle * 2.1)
      + 0.14 * Math.sin(t * 0.79 * blob.speed + blob.phase * 1.7 + angle * 3.4)
      + 0.07 * Math.cos(t * 1.13 * blob.speed + blob.phase * 0.8 - angle * 1.6)
    )
    const px = cx + Math.cos(angle) * r
    const py = cy + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(px, py)
    else {
      const prevAngle = ((i - 1) / N) * Math.PI * 2
      const prevR = baseRadius * (
        1
        + 0.22 * Math.sin(t * 0.53 * blob.speed + blob.phase + prevAngle * 2.1)
        + 0.14 * Math.sin(t * 0.79 * blob.speed + blob.phase * 1.7 + prevAngle * 3.4)
        + 0.07 * Math.cos(t * 1.13 * blob.speed + blob.phase * 0.8 - prevAngle * 1.6)
      )
      const midAngle = (angle + prevAngle) / 2
      const midR = (r + prevR) / 2 * (1 + 0.06 * Math.sin(t * 0.9 + i * 1.3))
      const mx = cx + Math.cos(midAngle) * midR
      const my = cy + Math.sin(midAngle) * midR
      ctx.quadraticCurveTo(px, py, mx, my)
    }
  }
  ctx.closePath()
  ctx.fillStyle = g
  ctx.fill()
}

function drawWisp(ctx: CanvasRenderingContext2D, w: Wisp, cx: number, cy: number, base: number, t: number) {
  const wx = cx + w.baseX * base + Math.sin(t * w.freqX + w.phase) * w.driftAmp
  const wy = cy + w.baseY * base + Math.cos(t * w.freqY + w.phase * 1.3) * w.driftAmp
  const r = w.size * base * (1 + 0.18 * Math.sin(t * 0.6 + w.phase))
  const g = ctx.createRadialGradient(wx, wy, 0, wx, wy, r)
  g.addColorStop(0, w.color.replace('OP', String(w.opacity)))
  g.addColorStop(0.4, w.color.replace('OP', String(w.opacity * 0.5)))
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.beginPath()
  ctx.arc(wx, wy, r, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
}

const blobDefs: Blob[] = [
  { phase: 0.0, speed: 1.00, r: 0.28, c0: 'rgba(200,120,30,0.12)', c1: 'rgba(170,90,15,0.04)', driftX: 0, driftY: 0, breath: 1 },
  { phase: 1.1, speed: 1.25, r: 0.20, c0: 'rgba(235,165,60,0.30)', c1: 'rgba(200,130,40,0.10)', driftX: 0, driftY: 0, breath: 1 },
  { phase: 2.3, speed: 0.88, r: 0.14, c0: 'rgba(255,210,95,0.50)', c1: 'rgba(225,165,60,0.16)', driftX: 0, driftY: 0, breath: 1 },
  { phase: 0.7, speed: 1.45, r: 0.10, c0: 'rgba(255,230,130,0.75)', c1: 'rgba(245,185,80,0.28)', driftX: 0, driftY: 0, breath: 1 },
  { phase: 1.8, speed: 0.70, r: 0.07, c0: 'rgba(255,248,200,0.92)', c1: 'rgba(255,220,130,0.40)', driftX: 0, driftY: 0, breath: 1 },
]

const wisps: Wisp[] = Array.from({ length: 10 }, (_, i) => ({
  phase: (i / 10) * Math.PI * 2,
  freqX: 0.3 + (i % 5) * 0.09,
  freqY: 0.37 + (i % 7) * 0.07,
  radius: 0.05 + (i % 4) * 0.02,
  baseX: Math.cos((i / 10) * Math.PI * 2) * 0.14,
  baseY: Math.sin((i / 10) * Math.PI * 2) * 0.11,
  driftAmp: 24 + (i % 6) * 8,
  opacity: 0.18 + (i % 5) * 0.04,
  size: 0.022 + (i % 4) * 0.006,
  color: i % 3 === 0 ? 'rgba(255,205,100,OP)' : i % 3 === 1 ? 'rgba(220,155,55,OP)' : 'rgba(200,120,35,OP)',
}))

export default function MobileEnterClient() {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const animRef    = useRef<number>(0)
  const tRef       = useRef<number>(0)
  const phaseRef   = useRef<Phase>('idle')
  const startRef   = useRef<number>(0)
  const router     = useRouter()

  const [uiPhase, setUiPhase] = useState<Phase>('idle')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width  = window.innerWidth  * dpr
      canvas.height = window.innerHeight * dpr
      ctx.scale(dpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = (now: number) => {
      const elapsed = now - startRef.current
      const phase   = phaseRef.current
      const t       = tRef.current
      const w       = window.innerWidth
      const h       = window.innerHeight
      const cx      = w * 0.5
      const cy      = h * 0.5
      const base    = Math.min(w, h)

      // Background
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.9)
      bg.addColorStop(0,   '#12121f')
      bg.addColorStop(0.5, '#0a0a15')
      bg.addColorStop(1,   '#04040a')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      if (phase === 'dissolve') {
        ctx.globalAlpha = Math.max(0, 1 - (elapsed - DISSOLVE_END) / 200)
      } else if (phase === 'done') {
        ctx.globalAlpha = 0
      } else {
        ctx.globalAlpha = 1
      }

      // Wisps
      for (const wisp of wisps) {
        drawWisp(ctx, wisp, cx, cy, base, t)
      }

      // Blobs
      for (const b of blobDefs) {
        const bx = cx + Math.sin(t * (0.08 + b.phase * 0.02)) * base * 0.10
        const by = cy + Math.cos(t * (0.06 + b.phase * 0.02)) * base * 0.08
        const br = b.r * base * (1 + 0.09 * Math.sin(t * 0.43 + b.phase) + 0.04 * Math.sin(t * 0.71 + b.phase))
        drawBlob(ctx, bx, by, br, t, b)
      }

      // Specular center
      const sc = 1 + 0.10 * Math.sin(t * 0.52) + 0.05 * Math.sin(t * 0.88)
      const spec = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 0.05 * sc)
      spec.addColorStop(0,   'rgba(255, 253, 242, 0.96)')
      spec.addColorStop(0.35, 'rgba(255, 228, 168, 0.52)')
      spec.addColorStop(0.7,  'rgba(255, 190, 80, 0.12)')
      spec.addColorStop(1,    'rgba(0,0,0,0)')
      ctx.beginPath()
      ctx.arc(cx, cy, base * 0.05 * sc, 0, Math.PI * 2)
      ctx.fillStyle = spec
      ctx.fill()

      ctx.globalAlpha = 1
      tRef.current += 0.016
      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  const expandProgress = uiPhase === 'expand'
    ? Math.min(1, (Date.now() - (startRef.current)) / EXPAND_END)
    : uiPhase === 'dissolve' || uiPhase === 'done' ? 1 : 0

  const dissolveProgress = uiPhase === 'dissolve'
    ? Math.min(1, (Date.now() - (startRef.current + DISSOLVE_END)) / 200)
    : uiPhase === 'done' ? 1 : 0

  const handleEnter = useCallback(() => {
    if (phaseRef.current !== 'idle') return
    phaseRef.current = 'expand'
    setUiPhase('expand')
    startRef.current = performance.now()

    setTimeout(() => {
      phaseRef.current = 'dissolve'
      setUiPhase('dissolve')
    }, DISSOLVE_END)

    setTimeout(() => {
      phaseRef.current = 'done'
      setUiPhase('done')
      router.push('/m/world')
    }, TOTAL)
  }, [router])

  return (
    <div className="m-enter-root" onClick={handleEnter}>
      <canvas ref={canvasRef} className="m-enter-canvas" />

      {/* Expand overlay */}
      <div
        className="m-enter-expand"
        style={{
          opacity: expandProgress,
          background: expandProgress < 0.85
            ? `radial-gradient(ellipse at center,
                rgba(255, 235, 170, ${0.92 - expandProgress * 0.3}) 0%,
                rgba(240, 185, 80, ${0.70 - expandProgress * 0.4}) 30%,
                rgba(200, 130, 40, 0.55) 60%,
                rgba(160, 100, 25, 0.80) 80%,
                rgba(80, 50, 10, 0.98) 100%)`
            : undefined,
          backgroundColor: expandProgress >= 0.85 ? '#fffdf0' : undefined,
        }}
      />

      {/* Dissolve overlay */}
      <div className="m-enter-dissolve" style={{ opacity: dissolveProgress }} />

      <p className="m-enter-text">这个世界正在等待你的介入</p>

      {/* Pulsing orb button */}
      <div className="m-enter-orb">
        <div className="m-enter-orb-ring" />
        <div className="m-enter-orb-core" />
      </div>
    </div>
  )
}