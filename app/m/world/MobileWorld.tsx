'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { WorldState, LogEntry, ScanResult, ShapeObject } from '@/types'
import ThreeBackground from '@/app/components/ThreeBackground'
import './MobileWorld.css'

type Phase = 'idle' | 'scanning' | 'interpreting' | 'generating' | 'done'
type EvolveMode = 'manual' | 'auto'
type ScreenOrient = 'portrait' | 'landscape' | 'checking'

interface WorldData {
  worldStates: WorldState[]
  logs: LogEntry[]
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const shapeNameMap: Record<string, string> = {
  circle: '圆形', triangle: '三角形', arc: '弧形', crescent: '弯月形',
  rectangle: '矩形', line: '线条', dot: '点', dots: '点', square: '方形',
}

function formatShapesAsNarrative(shapes: ShapeObject[]): string {
  if (shapes.length === 0) return ''
  const counts: Record<string, number> = {}
  shapes.forEach(s => { counts[s.type] = (counts[s.type] || 0) + 1 })
  return Object.entries(counts)
    .map(([type, count]) => `${shapeNameMap[type] || type}×${count}`)
    .join(' ')
}

const intentLabel: Record<string, string> = {
  agree: '继续', reject: '换个方向', modify: '修正', initial: '初次', none: '静观',
}

export default function MobileWorld() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [worldData, setWorldData] = useState<WorldData>({ worldStates: [], logs: [] })
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null)
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null)
  const [evolveMode, setEvolveMode] = useState<EvolveMode>('manual')
  const [evolveInterval, setEvolveInterval] = useState(5)
  const [lastScan, setLastScan] = useState<ScanResult | null>(null)
  const [screenOrient, setScreenOrient] = useState<ScreenOrient>('checking')

  // Typewriter
  const [displayedText, setDisplayedText] = useState('')
  const typewriterRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const evolveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetch('/api/world')
      .then(r => r.json())
      .then((data: WorldData) => setWorldData(data))
      .catch(() => {})
  }, [])

  // Detect screen orientation
  useEffect(() => {
    const check = () => {
      const landscape = window.innerWidth > window.innerHeight
      setScreenOrient(landscape ? 'landscape' : 'portrait')
    }
    check()
    window.addEventListener('resize', check)
    // Also listen for orientationchange on mobile
    window.addEventListener('orientationchange', () => setTimeout(check, 100))
    return () => {
      window.removeEventListener('resize', check)
    }
  }, [])

  const refreshWorld = useCallback(async () => {
    const res = await fetch('/api/world')
    const data: WorldData = await res.json()
    setWorldData(data)
  }, [])

  // Shared pipeline
  const runPipeline = useCallback(async (base64: string, mimeType = 'image/jpeg', scanImageUrl?: string) => {
    console.log('[MobileWorld] runPipeline called, base64 length:', base64.length, 'mimeType:', mimeType)
    setPhase('scanning')
    setStatusMsg('正在识别…')
    try {
      console.log('[MobileWorld] Calling /api/scan...')
      const scanRes = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      })
      console.log('[MobileWorld] /api/scan status:', scanRes.status)
      if (!scanRes.ok) throw new Error('识别失败')
      const scan: ScanResult = await scanRes.json()
      console.log('[MobileWorld] scan result:', JSON.stringify(scan).slice(0, 200))
      setLastScan(scan)
      setStatusMsg(`识别：${formatShapesAsNarrative(scan.shapes)}`)

      setPhase('interpreting')
      setStatusMsg('正在解读…')
      console.log('[MobileWorld] Calling /api/interpret...')
      const interpretRes = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scan),
      })
      console.log('[MobileWorld] /api/interpret status:', interpretRes.status)
      if (!interpretRes.ok) throw new Error('解读失败')
      const { interpretation, spatialDescription, logEntry } = await interpretRes.json()
      console.log('[MobileWorld] interpretation:', interpretation)

      setPhase('generating')
      setStatusMsg('正在生成…')
      const previousWorld = worldData.worldStates.length > 0
        ? worldData.worldStates[worldData.worldStates.length - 1] : null
      console.log('[MobileWorld] Calling /api/generate...')
      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interpretation, spatialDescription,
          spatialDetail: scan.spatialDetail,
          logEntry,
          triggeredBy: 'user',
          userIntent: scan.userIntent,
          previousInterpretation: previousWorld?.interpretation,
          scanImageUrl,
        }),
      })
      console.log('[MobileWorld] /api/generate status:', genRes.status)
      if (!genRes.ok) throw new Error('生成失败')
      await genRes.json()

      await refreshWorld()
      console.log('[MobileWorld] refreshWorld done')
      setStatusMsg('世界已更新')
      setPhase('done')
    } catch (err) {
      console.error('[MobileWorld] Pipeline error:', err)
      setStatusMsg(err instanceof Error ? err.message : '出错')
      setPhase('idle')
    }
  }, [refreshWorld, worldData.worldStates])

  // Camera / file upload
  const handleCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      console.error('[MobileWorld] No file selected')
      return
    }
    console.log('[MobileWorld] File captured:', file.name, file.size, file.type)

    // Compress image before sending to API
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      console.log('[MobileWorld] FileReader loaded, original length:', dataUrl.length)

      // Resize image to max 800px width to avoid 413 error
      const img = new window.Image()
      img.onload = async () => {
        const MAX_W = 800
        const scale = Math.min(1, MAX_W / img.width)
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, w, h)
        const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.8)
        console.log('[MobileWorld] Resized to', w, 'x', h, 'length:', resizedDataUrl.length)

        setUploadedPreview(resizedDataUrl)
        const base64 = resizedDataUrl.split(',')[1]
        console.log('[MobileWorld] Calling runPipeline with base64 length:', base64.length)
        try {
          await runPipeline(base64, 'image/jpeg', resizedDataUrl)
          console.log('[MobileWorld] Pipeline completed')
        } catch (err) {
          console.error('[MobileWorld] Pipeline error:', err)
        }
      }
      img.onerror = () => {
        console.error('[MobileWorld] Image load error')
      }
      img.src = dataUrl
    }
    reader.onerror = () => {
      console.error('[MobileWorld] FileReader error')
    }
    reader.readAsDataURL(file)
  }, [runPipeline])

  // Evolve
  const runEvolve = useCallback(async () => {
    if (phase !== 'idle' && phase !== 'done') return
    setPhase('generating')
    setStatusMsg('世界正在演化…')
    try {
      await fetch('/api/evolve', { method: 'POST' })
      await refreshWorld()
      setStatusMsg('演化完成')
      setPhase('done')
    } catch {
      setStatusMsg('演化失败')
      setPhase('idle')
    }
  }, [phase, refreshWorld])

  // Auto evolve timer
  useEffect(() => {
    if (evolveTimerRef.current) {
      clearInterval(evolveTimerRef.current)
      evolveTimerRef.current = null
    }
    if (evolveMode !== 'auto') return
    const ms = evolveInterval * 60 * 1000
    evolveTimerRef.current = setInterval(() => {
      if (phase === 'idle' || phase === 'done') runEvolve()
    }, ms)
    return () => {
      if (evolveTimerRef.current) clearInterval(evolveTimerRef.current)
    }
  }, [evolveMode, evolveInterval, runEvolve, phase])

  const latestWorld = worldData.worldStates.length > 0
    ? worldData.worldStates[worldData.worldStates.length - 1] : null
  const currentWorld = selectedWorldId
    ? worldData.worldStates.find(ws => ws.id === selectedWorldId) || latestWorld
    : latestWorld

  // Typewriter for current interpretation
  useEffect(() => {
    if (typewriterRef.current) clearTimeout(typewriterRef.current)
    const target = currentWorld?.interpretation || ''
    if (!target) { setDisplayedText(''); return }
    setDisplayedText('')
    let i = 0
    const type = () => {
      if (i < target.length) {
        setDisplayedText(target.slice(0, ++i))
        typewriterRef.current = setTimeout(type, 90)
      }
    }
    typewriterRef.current = setTimeout(type, 300)
    return () => { if (typewriterRef.current) clearTimeout(typewriterRef.current) }
  }, [currentWorld?.interpretation])

  const isBrowsing = selectedWorldId !== null && selectedWorldId !== latestWorld?.id

  const isBusy = phase === 'scanning' || phase === 'interpreting' || phase === 'generating'

  // Portrait: show rotation prompt
  if (screenOrient === 'portrait') {
    return (
      <div className="mw-root">
        <div className="mw-rotate-screen">
          <div className="mw-rotate-phone">
            <svg viewBox="0 0 60 120" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="4" width="52" height="112" rx="8" stroke="rgba(212,168,83,0.4)" strokeWidth="1.5"/>
              <rect x="12" y="16" width="36" height="72" rx="2" fill="rgba(212,168,83,0.08)" stroke="rgba(212,168,83,0.2)" strokeWidth="1"/>
              <circle cx="30" cy="100" r="4" fill="rgba(212,168,83,0.3)"/>
              <circle cx="30" cy="16" r="3" fill="rgba(212,168,83,0.4)"/>
              {/* rotation arrow */}
              <path d="M22 8 C14 4, 8 10, 8 18 L14 18" stroke="rgba(212,168,83,0.6)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <path d="M8 14 L14 18 L8 22" stroke="rgba(212,168,83,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <p className="mw-rotate-hint">请将设备横置</p>
          <p className="mw-rotate-sub">旋转后这个世界将完全展开</p>
        </div>
      </div>
    )
  }

  // Landscape / checking: show full interface
  return (
    <div className="mw-root mw-landscape">
      <ThreeBackground />
      {/* Header */}
      <header className="mw-header">
        <div className="mw-header-brand">
          <svg className="mw-logo" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="18" cy="18" r="16" stroke="rgba(212,168,83,0.5)" strokeWidth="1"/>
            <circle cx="18" cy="18" r="10" stroke="rgba(212,168,83,0.7)" strokeWidth="0.8"/>
            <circle cx="18" cy="18" r="4" fill="rgba(212,168,83,0.9)"/>
            <circle cx="18" cy="18" r="4">
              <animate attributeName="r" values="4;5.5;4" dur="3s" repeatCount="indefinite"/>
              <animate attributeName="fill-opacity" values="0.9;0.5;0.9" dur="3s" repeatCount="indefinite"/>
            </circle>
            <circle cx="18" cy="18" r="16">
              <animate attributeName="r" values="16;18;16" dur="4s" repeatCount="indefinite"/>
              <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="4s" repeatCount="indefinite"/>
            </circle>
          </svg>
          <span className="mw-header-title">介入者</span>
        </div>
        <button className="mw-header-journal-btn" onClick={() => router.push('/m/journal')}>
          日志
        </button>
      </header>
      {/* Left: timeline */}
      {worldData.worldStates.length > 0 && (
        <div className="mw-land-timeline scrollable">
          {worldData.worldStates.map((ws) => (
            <div
              key={ws.id}
              className={`mw-land-timeline-item ${selectedWorldId === ws.id ? 'active' : ''}`}
              onClick={() => setSelectedWorldId(ws.id === latestWorld?.id ? null : ws.id)}
            >
              <div className={`mw-land-timeline-dot ${ws.triggeredBy === 'user' ? 'dot-user' : 'dot-ai'}`} />
              <div className="mw-land-timeline-info">
                <span className="mw-land-timeline-time">{formatTime(ws.timestamp)}</span>
                <span className="mw-land-timeline-interp">{ws.interpretation.slice(0, 6)}{ws.interpretation.length > 6 ? '…' : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Center: world display */}
      <div className="mw-land-center">
        {/* Dedicated processing indicator - always visible during pipeline */}
        {isBusy && !currentWorld && (
          <div className="mw-land-processing-indicator">
            <div className="mw-land-processing-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(212,168,83,0.8)" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.3"/>
                <path d="M12 2 C12 2, 12 12, 12 12">
                  <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="2s" repeatCount="indefinite"/>
                </path>
              </svg>
            </div>
            <div className="mw-land-processing-label">
              {phase === 'scanning' ? '正在识别' : phase === 'interpreting' ? '正在解读' : '正在生成'}
            </div>
            <div className="mw-land-processing-steps">
              <div className={`mw-proc-step ${phase === 'scanning' ? 'active' : ''}`}>
                <span className="mw-proc-dot" />
                <span>识别</span>
              </div>
              <span className="mw-proc-arrow">→</span>
              <div className={`mw-proc-step ${phase === 'interpreting' ? 'active' : ''}`}>
                <span className="mw-proc-dot" />
                <span>解读</span>
              </div>
              <span className="mw-proc-arrow">→</span>
              <div className={`mw-proc-step ${phase === 'generating' ? 'active' : ''}`}>
                <span className="mw-proc-dot" />
                <span>生成</span>
              </div>
            </div>
            <div className="mw-land-processing-detail">{statusMsg}</div>
          </div>
        )}

        {/* Image area */}
        <div className="mw-land-image-wrap">
          {currentWorld ? (
            <>
              <div className={`mw-land-glow ${currentWorld.triggeredBy === 'user' ? 'glow-user' : 'glow-ai'}`} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={currentWorld.imageUrl} alt="世界" className="mw-land-image" />
            </>
          ) : !isBusy ? (
            <div className="mw-land-void">
              <p className="mw-land-void-text">世界尚未诞生</p>
              <p className="mw-land-void-sub">拍摄物品，开始介入</p>
            </div>
          ) : null}

          {/* Uploaded preview as pip — top-left of world image */}
          {uploadedPreview && (
            <div className="mw-land-upload-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={uploadedPreview} alt="上传" className="mw-land-upload-img" />
              <button className="mw-land-upload-clear" onClick={() => setUploadedPreview(null)}>✕</button>
            </div>
          )}

          {/* Scanning overlay on top of existing world image */}
          {currentWorld && isBusy && (
            <div className="mw-land-scanning-overlay">
              <span className="mw-land-scanning-label">
                {phase === 'scanning' ? '识别中' : phase === 'interpreting' ? '解读中' : '生成中'}
              </span>
              <span className="mw-land-scanning-detail">{statusMsg}</span>
              <div className="mw-land-scanning-dots">
                <span className="mw-land-scanning-dot" />
                <span className="mw-land-scanning-dot" />
                <span className="mw-land-scanning-dot" />
              </div>
            </div>
          )}
        </div>

        {/* Echo text */}
        <div className="mw-land-echo">
          {displayedText && <span className="mw-land-echo-text">{displayedText}</span>}
        </div>

        {/* Scan info */}
        {lastScan && lastScan.shapes.length > 0 && (
          <div className="mw-land-scan-info">
            <span className={`mw-intent-badge intent-${lastScan.userIntent}`}>
              {intentLabel[lastScan.userIntent] || lastScan.userIntent}
            </span>
            <span className="mw-shapes-label">{formatShapesAsNarrative(lastScan.shapes)}</span>
          </div>
        )}

        {/* Status */}
        {statusMsg && phase === 'idle' && (
          <div className="mw-land-status">{statusMsg}</div>
        )}
      </div>

      {/* Right: logs */}
      {worldData.logs.length > 0 && (
        <div className="mw-land-logs scrollable">
          <div className="mw-land-logs-header">
            <span>世界日志</span>
            <span className="mw-land-logs-count">{worldData.logs.length}条</span>
          </div>
          <div className="mw-land-logs-list">
            {[...worldData.logs].reverse().slice(0, 8).map(log => (
              <div key={log.id} className={`mw-land-log-item log-${log.triggeredBy}`}>
                <span className="mw-land-log-time">{formatTime(log.timestamp)}</span>
                <p className="mw-land-log-content">{log.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls at bottom */}
      <footer className="mw-land-controls">
        <div className="mw-land-mode-toggle">
          <button
            className={`mw-mode-btn ${evolveMode === 'manual' ? 'active' : ''}`}
            onClick={() => setEvolveMode('manual')}
          >静观</button>
          <span className="mw-mode-sep">｜</span>
          <button
            className={`mw-mode-btn ${evolveMode === 'auto' ? 'active' : ''}`}
            onClick={() => setEvolveMode('auto')}
          >自生</button>
          {evolveMode === 'auto' && (
            <span className="mw-land-interval">
              每<input
                type="number" min={1} max={60}
                value={evolveInterval}
                onChange={e => setEvolveInterval(Math.min(60, Math.max(1, Number(e.target.value))))}
                className="mw-interval-input"
              />分钟
            </span>
          )}
        </div>

        <div className="mw-land-action-btns">
          <button
            className="mw-icon-btn mw-evolve-btn"
            disabled={isBusy}
            onClick={runEvolve}
            title="演化一次"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 12 C12 8, 8 6, 5 7 C8 7, 11 9, 12 12"/>
              <path d="M12 12 C14 10, 16 7, 17 4 C17 7, 14 10, 12 12"/>
              <path d="M12 12 C14 14, 16 17, 14 20 C14 17, 13 15, 12 12"/>
              <path d="M12 12 C10 14, 7 17, 4 16 C7 16, 10 14, 12 12"/>
              <path d="M12 12 C10 10, 7 7, 10 4 C10 7, 11 9, 12 12"/>
              <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
            </svg>
          </button>

          <div className="mw-camera-wrap" style={{ position: 'relative' }}>
            {/* Label overlay covering the entire camera wrap area */}
            <label htmlFor="mobile-cam-input" style={{
              position: 'absolute', inset: 0, cursor: isBusy ? 'not-allowed' : 'pointer', zIndex: 1,
            }} />
            <div
              className={`mw-camera-ring ${isBusy ? 'busy' : ''}`}
              style={{ cursor: isBusy ? 'not-allowed' : 'pointer' }}
            >
              <div className="mw-camera-core" />
            </div>
            <span className="mw-camera-label">{isBusy ? '处理中…' : '拍照介入'}</span>
          </div>
          <input
            id="mobile-cam-input"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCapture}
            style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none', zIndex: -1 }}
          />

          <button
            className="mw-icon-btn mw-reset-btn"
            disabled={isBusy}
            onClick={async () => {
              await fetch('/api/world/reset', { method: 'POST' })
              setWorldData({ worldStates: [], logs: [] })
              setLastScan(null)
              setUploadedPreview(null)
              setSelectedWorldId(null)
              setStatusMsg('')
              setPhase('idle')
            }}
            title="重置世界"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>
        </div>

        {isBrowsing && (
          <button className="mw-back-hint" onClick={() => setSelectedWorldId(null)}>
            ← 返回当前世界
          </button>
        )}
      </footer>
    </div>
  )
}