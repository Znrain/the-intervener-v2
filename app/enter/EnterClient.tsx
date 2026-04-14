'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type Phase = 'idle' | 'ripple' | 'expand' | 'dissolve' | 'done'
function drawBlob(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  baseRadius: number,
  t: number,
  blobPhase: number,
  blobSpeed: number,
  color0: string,
  color1: string,
) {
  const N = 7
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 1.1)
  g.addColorStop(0,    color0)
  g.addColorStop(0.50, color1)
  g.addColorStop(1,    'rgba(0,0,0,0)')

  ctx.beginPath()
  for (let i = 0; i <= N; i++) {
    const angle = (i / N) * Math.PI * 2
    const r =
      baseRadius * (
        1
        + 0.22 * Math.sin(t * 0.53 * blobSpeed + blobPhase + angle * 2.1)
        + 0.14 * Math.sin(t * 0.79 * blobSpeed + blobPhase * 1.7 + angle * 3.4)
        + 0.07 * Math.cos(t * 1.13 * blobSpeed + blobPhase * 0.8 - angle * 1.6)
      )
    const px = cx + Math.cos(angle) * r
    const py = cy + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(px, py)
    else {
      const prevAngle = ((i - 1) / N) * Math.PI * 2
      const prevR =
        baseRadius * (
          1
          + 0.22 * Math.sin(t * 0.53 * blobSpeed + blobPhase + prevAngle * 2.1)
          + 0.14 * Math.sin(t * 0.79 * blobSpeed + blobPhase * 1.7 + prevAngle * 3.4)
          + 0.07 * Math.cos(t * 1.13 * blobSpeed + blobPhase * 0.8 - prevAngle * 1.6)
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

/* ── Wisp particle ─────────────────────────────────────────────────── */
interface Wisp {
  phase: number
  freqX: number; freqY: number
  radius: number
  baseX: number; baseY: number
  driftAmp: number
  opacity: number
  size: number
  color: string
}

function drawWisp(ctx: CanvasRenderingContext2D, w: Wisp, cx: number, cy: number, base: number, t: number) {
  const wx = cx + w.baseX * base + Math.sin(t * w.freqX + w.phase) * w.driftAmp
  const wy = cy + w.baseY * base + Math.cos(t * w.freqY + w.phase * 1.3) * w.driftAmp
  const r  = w.size * base * (1 + 0.18 * Math.sin(t * 0.6 + w.phase))
  const g  = ctx.createRadialGradient(wx, wy, 0, wx, wy, r)
  g.addColorStop(0,   w.color.replace('OP', String(w.opacity)))
  g.addColorStop(0.4, w.color.replace('OP', String(w.opacity * 0.5)))
  g.addColorStop(1,   'rgba(0,0,0,0)')
  ctx.beginPath()
  ctx.arc(wx, wy, r, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
}

/* ── Timing constants ──────────────────────────────────────────────── */
const EXPAND_START  = 0     // start immediately on click
const EXPAND_END    = 1200  // ms — golden expansion fills screen by 1.2s
const DISSOLVE_START = EXPAND_END
const DISSOLVE_END  = 2000  // ms — dissolve to black by 2s total
const TOTAL         = DISSOLVE_END + 200  // 2.2s total

export default function EnterPage() {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const animRef   = useRef<number>(0)
  const tRef      = useRef<number>(0)
  const phaseRef  = useRef<Phase>('idle')
  const startRef  = useRef<number>(0)
  const router    = useRouter()

  const [uiPhase, setUiPhase] = useState<Phase>('idle')

  // Wisps — pre-seeded so they're stable across renders
  const wisps = useRef<Wisp[]>(
    Array.from({ length: 14 }, (_, i) => ({
      phase:     (i / 14) * Math.PI * 2,
      freqX:     0.3  + (i % 5) * 0.09,
      freqY:     0.37 + (i % 7) * 0.07,
      radius:    0.05 + (i % 4) * 0.02,
      baseX:     Math.cos((i / 14) * Math.PI * 2) * 0.14,
      baseY:     Math.sin((i / 14) * Math.PI * 2) * 0.11,
      driftAmp:  30 + (i % 6) * 8,
      opacity:   0.18 + (i % 5) * 0.04,
      size:      0.022 + (i % 4) * 0.006,
      color:     i % 3 === 0
        ? 'rgba(255,205,100,OP)'
        : i % 3 === 1
        ? 'rgba(220,155,55,OP)'
        : 'rgba(200,120,35,OP)',
    }))
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width  = window.innerWidth  * dpr
      canvas.height = window.innerHeight * dpr
      ctx.scale(dpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = (now: number) => {
      const elapsed = now - startRef.current
      const phase   = phaseRef.current
      const t  = tRef.current
      const w  = window.innerWidth
      const h  = window.innerHeight
      const cx = w * 0.5
      const cy = h * 0.5
      const base = Math.min(w, h)

      // ── Background ──────────────────────────────────────────────────
      const bgX = cx + Math.cos(t * 0.07) * w * 0.05
      const bgY = cy + Math.sin(t * 0.05) * h * 0.04
      const bg  = ctx.createRadialGradient(bgX, bgY, 0, cx, cy, Math.max(w, h) * 0.92)
      bg.addColorStop(0,    '#12121f')
      bg.addColorStop(0.42, '#0a0a15')
      bg.addColorStop(1,    '#04040a')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      // ── Phase transitions ────────────────────────────────────────────
      if (phase === 'idle') {
        // ambient orb stays alive
      } else if (phase === 'expand') {
        ctx.globalAlpha = 1
      } else if (phase === 'dissolve') {
        const dp = Math.min(1, (elapsed - DISSOLVE_START) / (DISSOLVE_END - DISSOLVE_START))
        ctx.globalAlpha = 1 - dp
      } else if (phase === 'done') {
        ctx.globalAlpha = 0
      }

      // ── Far ambient halo ─────────────────────────────────────────────
      const haloX = cx + Math.sin(t * 0.04) * base * 0.03
      const haloY = cy + Math.cos(t * 0.03) * base * 0.02
      const halo  = ctx.createRadialGradient(haloX, haloY, 0, cx, cy, base * 0.55)
      halo.addColorStop(0,   'rgba(190, 120, 35, 0.07)')
      halo.addColorStop(0.5, 'rgba(160, 90,  20, 0.03)')
      halo.addColorStop(1,   'rgba(0,0,0,0)')
      ctx.fillStyle = halo
      ctx.fillRect(0, 0, w, h)

      // ── Wisps ────────────────────────────────────────────────────────
      for (const wisp of wisps.current) {
        drawWisp(ctx, wisp, cx, cy, base, t)
      }

      // ── Main organic blobs ─────────────────────────────────────────────
      const blobDefs = [
        {
          driftX: Math.sin(t * 0.08)         * 0.10,
          driftY: Math.cos(t * 0.06)         * 0.08,
          breath: 1 + 0.09 * Math.sin(t * 0.43) + 0.04 * Math.sin(t * 0.71),
          phase:  0.0, speed: 1.00,
          r: 0.27 * base,
          c0: 'rgba(200,120,30,0.11)', c1: 'rgba(170,90,15,0.04)',
        },
        {
          driftX: Math.cos(t * 0.11 + 1.3) * 0.08,
          driftY: Math.sin(t * 0.09 + 0.7) * 0.07,
          breath: 1 + 0.11 * Math.sin(t * 0.56) + 0.05 * Math.cos(t * 0.83),
          phase:  1.1, speed: 1.25,
          r: 0.19 * base,
          c0: 'rgba(235,165,60,0.28)', c1: 'rgba(200,130,40,0.10)',
        },
        {
          driftX: Math.sin(t * 0.14 + 2.1) * 0.06,
          driftY: Math.cos(t * 0.10 + 1.4) * 0.06,
          breath: 1 + 0.13 * Math.sin(t * 0.48) + 0.06 * Math.cos(t * 0.67),
          phase:  2.3, speed: 0.88,
          r: 0.13 * base,
          c0: 'rgba(255,210,95,0.48)', c1: 'rgba(225,165,60,0.16)',
        },
        {
          driftX: Math.cos(t * 0.18 + 0.5) * 0.05,
          driftY: Math.sin(t * 0.13 + 2.0) * 0.05,
          breath: 1 + 0.15 * Math.sin(t * 0.61) + 0.07 * Math.cos(t * 0.93),
          phase:  0.7, speed: 1.45,
          r: 0.09 * base,
          c0: 'rgba(255,230,130,0.74)', c1: 'rgba(245,185,80,0.28)',
        },
        {
          driftX: Math.sin(t * 0.22 + 3.0) * 0.04,
          driftY: Math.cos(t * 0.17 + 1.8) * 0.04,
          breath: 1 + 0.17 * Math.sin(t * 0.55) + 0.08 * Math.cos(t * 0.79),
          phase:  1.8, speed: 0.70,
          r: 0.062 * base,
          c0: 'rgba(255,248,200,0.90)', c1: 'rgba(255,220,130,0.40)',
        },
      ]

      for (const b of blobDefs) {
        const bx = cx + b.driftX * base
        const by = cy + b.driftY * base
        const br = b.r * b.breath
        drawBlob(ctx, bx, by, br, t, b.phase, b.speed, b.c0, b.c1)
      }

      // ── Specular center ───────────────────────────────────────────────
      const sc = 1 + 0.10 * Math.sin(t * 0.52) + 0.05 * Math.sin(t * 0.88)
      const spec = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 0.048 * sc)
      spec.addColorStop(0,   'rgba(255, 253, 242, 0.96)')
      spec.addColorStop(0.35, 'rgba(255, 228, 168, 0.52)')
      spec.addColorStop(0.7,  'rgba(255, 190, 80,  0.12)')
      spec.addColorStop(1,    'rgba(0,0,0,0)')
      ctx.beginPath()
      ctx.arc(cx, cy, base * 0.048 * sc, 0, Math.PI * 2)
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

  /* ── Ripple drawing ─────────────────────────────────────────────────── */
  /* ── Expand overlay ─────────────────────────────────────────────────── */
  const expandProgress = uiPhase === 'expand'
    ? Math.min(1, (Date.now() - (startRef.current + EXPAND_START)) / (EXPAND_END - EXPAND_START))
    : uiPhase === 'dissolve' || uiPhase === 'done'
    ? 1
    : 0

  /* ── Dissolve overlay ───────────────────────────────────────────────── */
  const dissolveProgress = uiPhase === 'dissolve'
    ? Math.min(1, (Date.now() - (startRef.current + DISSOLVE_START)) / (DISSOLVE_END - DISSOLVE_START))
    : uiPhase === 'done' ? 1 : 0

  /* ── Click handler ──────────────────────────────────────────────────── */
  const handleClick = useCallback(() => {
    if (phaseRef.current !== 'idle') return
    phaseRef.current = 'expand'
    setUiPhase('expand')
    startRef.current = performance.now()

    // Phase: expand → dissolve (1.2s)
    setTimeout(() => {
      phaseRef.current = 'dissolve'
      setUiPhase('dissolve')
    }, DISSOLVE_START)

    // Phase: done → navigate
    setTimeout(() => {
      phaseRef.current = 'done'
      setUiPhase('done')
      router.push('/world')
    }, TOTAL)
  }, [router])

  return (
    <div className="enter-root" onClick={handleClick}>
      <canvas ref={canvasRef} className="enter-canvas" />

      {/* Expand overlay — golden light fills screen from center */}
      <div
        className="enter-expand"
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

      {/* Dissolve overlay — warm white to deep black */}
      <div
        className="enter-dissolve"
        style={{ opacity: dissolveProgress }}
      />

      <p className="enter-text">这个世界正在等待你的介入</p>
    </div>
  )
}
