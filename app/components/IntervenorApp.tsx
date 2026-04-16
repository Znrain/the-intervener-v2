'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { WorldState, LogEntry, ScanResult, ShapeObject } from '@/types'
import ThreeBackground from './ThreeBackground'

type Phase = 'idle' | 'scanning' | 'interpreting' | 'generating' | 'done'
type EvolveMode = 'manual' | 'auto'

interface WorldData {
  worldStates: WorldState[]
  logs: LogEntry[]
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const intentLabel: Record<string, string> = {
  agree: '同意 — 继续此方向',
  reject: '拒绝 — 换个方向',
  modify: '修正 — 调整方向',
  initial: '初次介入',
  none: '静观 — 保持此刻',
}

// Position Chinese name map
const positionMap: Record<string, string> = {
  'top-left': '左上角',
  'top-center': '上方',
  'top-right': '右上角',
  'center-left': '左侧',
  'center': '中央',
  'center-right': '右侧',
  'bottom-left': '左下角',
  'bottom-center': '下方',
  'bottom-right': '右下角',
}

// Size adjective map
const sizeMap: Record<string, string> = {
  large: '大的',
  medium: '',
  small: '小的',
}

// Shape noun map (Chinese)
const shapeNameMap: Record<string, string> = {
  circle: '圆形',
  triangle: '三角形',
  arc: '弧形',
  crescent: '弯月形',
  rectangle: '矩形',
  line: '线条',
  dot: '点',
  dots: '点',
  square: '方形',
  hexagon: '六边形',
  cluster: '聚集的形状',
}

function formatShapesAsNarrative(shapes: ShapeObject[]): string {
  if (shapes.length === 0) return '我还没看清你放了什么。'

  // Group shapes: separate small scattered elements from notable ones
  const smallDots: ShapeObject[] = []
  const notable: ShapeObject[] = []

  for (const s of shapes) {
    const isSmallDot = (s.type === 'dot' || s.type === 'dots') && s.size === 'small'
    if (isSmallDot) {
      smallDots.push(s)
    } else {
      notable.push(s)
  }
  }

  const parts: string[] = []

  // Describe notable shapes individually
  for (const s of notable) {
    const name = shapeNameMap[s.type] || s.type
    const sizeAdj = sizeMap[s.size] || ''
    const posName = positionMap[s.position] || s.position

    // Build phrase: "一个靠近{位置}的{大小}{形状}"
    let phrase: string
    if (s.position === 'center') {
      phrase = `一个${sizeAdj ? sizeAdj + '、' : ''}靠近中央的${name}`
    } else {
      phrase = `一个${sizeAdj ? sizeAdj + '、' : ''}位于${posName}的${name}`
    }
    parts.push(phrase)
  }

  // Group small dots into one phrase
  if (smallDots.length > 0) {
    const positions = smallDots.map((d) => positionMap[d.position] || d.position)
    const uniquePositions = [...new Set(positions)]

    if (smallDots.length >= 3) {
      if (uniquePositions.length === 1) {
        parts.push(`${uniquePositions[0]}有一些零散的小点`)
      } else {
        parts.push('还有一些零散的小点散布在各处')
      }
    } else if (smallDots.length === 2) {
      if (uniquePositions.length === 1) {
        parts.push(`${uniquePositions[0]}有两个小点`)
      } else {
        parts.push(uniquePositions.join('和') + '各有一个小点')
      }
    } else {
      const pos = positions[0]
      parts.push(`${pos}有一个小点`)
    }
  }

  // Join with natural Chinese connectors
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]}，${parts[1]}`
  return `${parts.slice(0, -1).join('，')}，${parts[parts.length - 1]}`
}

export default function IntervenorApp() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [cameraReady, setCameraReady] = useState(false)
  const [cameraOpening, setCameraOpening] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [statusMsg, setStatusMsg] = useState<string>('')
  const [lastScan, setLastScan] = useState<ScanResult | null>(null)
  const [worldData, setWorldData] = useState<WorldData>({ worldStates: [], logs: [] })
  const [latestInterpretation, setLatestInterpretation] = useState<string>('')
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null)
  const [selectedWorldStateId, setSelectedWorldStateId] = useState<string | null>(null)
  const [highlightedLogId, setHighlightedLogId] = useState<string | null>(null)

  // Sync highlightedLogId with selectedWorldStateId — left/right panel selection stays in sync
  useEffect(() => {
    setHighlightedLogId(selectedWorldStateId)
  }, [selectedWorldStateId])
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null)

  // Evolution mode state
  const [evolveMode, setEvolveMode] = useState<EvolveMode>('manual')
  const [evolveInterval, setEvolveInterval] = useState(5) // minutes
  const evolveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Typewriter effect state
  const [displayedText, setDisplayedText] = useState('')
  const typewriterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/world')
      .then((r) => r.json())
      .then((data: WorldData) => setWorldData(data))
      .catch(() => {})
  }, [])

  const closeCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraReady(false)
    setCameraOpening(false)
  }, [])

  const openCamera = useCallback(async () => {
    if (cameraReady || cameraOpening) return

    setCameraOpening(true)
    setCameraError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })

      streamRef.current = stream
      setCameraReady(true)
    } catch {
      setCameraError('无法访问摄像头')
    } finally {
      setCameraOpening(false)
    }
  }, [cameraOpening, cameraReady])

  // Connect stream to video element — also depends on worldStates.length so it re-runs
  // when the first world is created (video moves from main area to PIP) and the new
  // element gets srcObject set.
  useEffect(() => {
    if (cameraReady && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [cameraReady, worldData.worldStates.length])

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
  }, [])

  const refreshWorld = useCallback(async () => {
    const res = await fetch('/api/world')
    const data: WorldData = await res.json()
    setWorldData(data)
  }, [])

  // Shared pipeline: base64 → scan → interpret → generate
  const runPipeline = useCallback(async (base64: string, mimeType = 'image/jpeg', scanImageUrl?: string) => {
    console.log('[Pipeline] Starting pipeline', { mimeType, base64Length: base64.length })
    setPhase('scanning')
    setStatusMsg('正在识别形状……')

    console.log('[Pipeline] → Sending to /api/scan:', { imageBase64Length: base64.length, mimeType })
    const scanRes = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mimeType }),
    })
    if (!scanRes.ok) {
      const err = await scanRes.json().catch(() => ({ error: '未知错误' }))
      throw new Error(err.error ?? '识别接口错误')
    }
    const scan: ScanResult = await scanRes.json()
    console.log('[Pipeline] ← /api/scan response:', scan)
    setLastScan(scan)
    setStatusMsg(`识别完成：${formatShapesAsNarrative(scan.shapes)}`)

    setPhase('interpreting')
    setStatusMsg('正在解读……')

    console.log('[Pipeline] → Sending to /api/interpret:', scan)
    const interpretRes = await fetch('/api/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scan),
    })
    if (!interpretRes.ok) {
      const err = await interpretRes.json().catch(() => ({ error: '未知错误' }))
      throw new Error(err.error ?? '解读接口错误')
    }
    const { interpretation, spatialDescription, logEntry } = await interpretRes.json()
    console.log('[Pipeline] ← /api/interpret response:', { interpretation, spatialDescription, logEntry })
    setLatestInterpretation(interpretation)
    setStatusMsg(`解读：${interpretation}`)

    setPhase('generating')
    setStatusMsg('正在生成世界画面……')

    // Get previous world state for continuity
    const previousWorld = worldData.worldStates.length > 0
      ? worldData.worldStates[worldData.worldStates.length - 1]
      : null

    const genPayload = {
      interpretation,
      spatialDescription,
      spatialDetail: scan.spatialDetail,
      logEntry,
      triggeredBy: 'user',
      userIntent: scan.userIntent,
      previousInterpretation: previousWorld?.interpretation,
      scanImageUrl,
    }
    console.log('[Pipeline] → Sending to /api/generate:', genPayload)
    const genRes = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(genPayload),
    })
    if (!genRes.ok) {
      const err = await genRes.json().catch(() => ({ error: '未知错误' }))
      throw new Error(err.error ?? '生成接口错误')
    }
    const genData = await genRes.json()
    console.log('[Pipeline] ← /api/generate response:', genData)

    await refreshWorld()
    setStatusMsg('世界已更新')
    setPhase('done')
  }, [refreshWorld, worldData.worldStates])

  const handleScan = useCallback(async () => {
    if (phase !== 'idle' && phase !== 'done') return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!cameraReady || !video || !canvas) { setStatusMsg('请先打开摄像头'); return }

    console.log('[Scan] Scan button clicked', {
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      readyState: video.readyState,
    })

    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
    console.log('[Scan] Image captured', {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      base64Length: base64.length,
    })
    setCapturedPreview(canvas.toDataURL('image/jpeg', 0.8))
    setUploadedPreview(null)

    try {
      await runPipeline(base64, 'image/jpeg', canvas.toDataURL('image/jpeg', 0.8))
    } catch (err) {
      const msg = err instanceof Error ? err.message : '出现错误，请重试'
      setStatusMsg(msg)
      setPhase('idle')
      console.error(err)
    }
  }, [cameraReady, phase, runPipeline])

  const handleUploadClick = useCallback(() => {
    if (phase !== 'idle' && phase !== 'done') return
    uploadInputRef.current?.click()
  }, [phase])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const mimeType = file.type || 'image/jpeg'
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      setUploadedPreview(dataUrl)
      const base64 = dataUrl.split(',')[1]
      try {
        await runPipeline(base64, mimeType, dataUrl)
      } catch (err) {
        const msg = err instanceof Error ? err.message : '出现错误，请重试'
        setStatusMsg(msg)
        setPhase('idle')
        console.error(err)
      }
    }
    reader.readAsDataURL(file)
  }, [runPipeline])

  const handleRestart = useCallback(async () => {
    if (phase === 'scanning' || phase === 'interpreting' || phase === 'generating') return
    await fetch('/api/world/reset', { method: 'POST' })
    setWorldData({ worldStates: [], logs: [] })
    setLatestInterpretation('')
    setLastScan(null)
    setUploadedPreview(null)
    setCapturedPreview(null)
    setSelectedWorldStateId(null)
    setStatusMsg('')
    setPhase('idle')
  }, [phase])

  // Single evolve action (used by both manual and auto)
  const runEvolve = useCallback(async () => {
    if (phase !== 'idle' && phase !== 'done') return
    setPhase('generating')
    setStatusMsg('世界正在自主演化……')
    try {
      await fetch('/api/evolve', { method: 'POST' })
      await refreshWorld()
      setStatusMsg('世界完成了一次自主演化')
      setPhase('done')
    } catch {
      setStatusMsg('演化失败')
      setPhase('idle')
    }
  }, [phase, refreshWorld])

  // Manual evolve button
  const handleEvolveManual = useCallback(() => {
    if (phase !== 'idle' && phase !== 'done') return
    runEvolve()
  }, [phase, runEvolve])

  // Toggle between manual and auto mode
  const handleToggleMode = useCallback(() => {
    setEvolveMode((prev) => (prev === 'manual' ? 'auto' : 'manual'))
  }, [])

  // Update interval with immediate restart if auto is active
  const handleIntervalChange = useCallback((value: number) => {
    const clamped = Math.min(60, Math.max(1, value))
    setEvolveInterval(clamped)
  }, [])

  // Auto-evolve timer effect
  useEffect(() => {
    // Clear any existing timer
    if (evolveTimerRef.current) {
      clearInterval(evolveTimerRef.current)
      evolveTimerRef.current = null
    }

    if (evolveMode !== 'auto') return

    const intervalMs = evolveInterval * 60 * 1000

    evolveTimerRef.current = setInterval(() => {
      // Only fire if not busy
      if (phase === 'idle' || phase === 'done') {
        runEvolve()
      }
    }, intervalMs)

    return () => {
      if (evolveTimerRef.current) {
        clearInterval(evolveTimerRef.current)
        evolveTimerRef.current = null
      }
    }
  }, [evolveMode, evolveInterval, runEvolve, phase])

  const latestWorldState =
    worldData.worldStates.length > 0
      ? worldData.worldStates[worldData.worldStates.length - 1]
      : null

  const selectedWorldState = selectedWorldStateId
    ? worldData.worldStates.find((ws) => ws.id === selectedWorldStateId) || latestWorldState
    : latestWorldState

  const currentWorld = selectedWorldState

  const isBrowsingHistory =
    selectedWorldStateId !== null && selectedWorldStateId !== latestWorldState?.id

  // Typewriter effect for world echo text
  useEffect(() => {
    const targetText = currentWorld?.interpretation || ''

    // Clear any existing timer
    if (typewriterTimerRef.current) {
      clearTimeout(typewriterTimerRef.current)
      typewriterTimerRef.current = null
    }

    // If no text, clear immediately
    if (!targetText) {
      setDisplayedText('')
      return
    }

    // Always start fresh for new interpretation
    setDisplayedText('')
    const startTyping = () => {
      let index = 0
      const type = () => {
        if (index < targetText.length) {
          setDisplayedText(targetText.slice(0, index + 1))
          index++
          typewriterTimerRef.current = setTimeout(type, 80)
        }
      }
      type()
    }
    // Small delay so fade-out is visible before new text appears
    typewriterTimerRef.current = setTimeout(startTyping, 200)

    return () => {
      if (typewriterTimerRef.current) {
        clearTimeout(typewriterTimerRef.current)
        typewriterTimerRef.current = null
      }
    }
  }, [currentWorld?.interpretation])

  const handleSelectWorldState = useCallback((worldStateId: string) => {
    // Derive latestId inline to avoid stale closure / unstable dependency
    const latestId = worldData.worldStates[worldData.worldStates.length - 1]?.id
    if (worldStateId === latestId) {
      setSelectedWorldStateId(null)
      return
    }

    setSelectedWorldStateId(worldStateId)
  }, [worldData.worldStates.length])

  const handleReturnToCurrentWorld = useCallback(() => {
    setSelectedWorldStateId(null)
  }, [])

  const handleEndIntervention = useCallback(() => {
    router.push('/journal')
  }, [router])

  const isBusy = phase === 'scanning' || phase === 'interpreting' || phase === 'generating'

  // Build evolve particles — 16 slow drifting specks
  const evolveParticles =
    evolveMode === 'auto'
      ? Array.from({ length: 16 }, (_, i) => {
          const side = i % 4 // 0=bottom 1=right 2=top 3=left
          const progress = (i / 16) // spread evenly
          let style: React.CSSProperties
          if (side === 0) {
            // bottom edge, drifting upward
            style = {
              left: `${10 + progress * 80}%`,
              bottom: '10px',
              '--drift-x': `${(i % 2 === 0 ? 1 : -1) * (6 + (i % 5) * 3)}px`,
            } as React.CSSProperties
          } else if (side === 1) {
            // right edge, drifting left
            style = {
              right: '10px',
              top: `${15 + progress * 70}%`,
              '--drift-x': `${-(6 + (i % 5) * 3)}px`,
            } as React.CSSProperties
          } else if (side === 2) {
            // top edge, drifting down (rare, most start from sides)
            style = {
              left: `${15 + progress * 70}%`,
              top: '10px',
              '--drift-x': `${(i % 2 === 0 ? 1 : -1) * (4 + (i % 4) * 2)}px`,
            } as React.CSSProperties
          } else {
            // left edge, drifting right
            style = {
              left: '10px',
              top: `${20 + progress * 60}%`,
              '--drift-x': `${6 + (i % 5) * 3}px`,
            } as React.CSSProperties
          }
          const size = 2 + (i % 3)
          const hue = 195 + (i % 3) * 6 // cool blue-silver
          const dur = 4 + (i % 4) * 1.5
          const delay = -(i * 0.65) // stagger so they don't all start together
          return (
            <span
              key={i}
              className="evolve-particle"
              style={{
                ...style,
                width: `${size}px`,
                height: `${size}px`,
                background: `hsla(${hue}, 40%, 78%, 0.55)`,
                boxShadow: `0 0 ${size * 2}px hsla(${hue}, 40%, 78%, 0.35)`,
                animationDuration: `${dur}s`,
                animationDelay: `${delay}s`,
              }}
            />
          )
        })
      : null

  return (
    <div className="world-root">
      {/* Three.js 3D background scene */}
      <ThreeBackground />

      {/* Background with 3D depth gradients */}
      <div className="world-bg" />

      {/* Evolve ambient particles — visible only in auto mode */}
      {evolveParticles && (
        <div className="evolve-particles">{evolveParticles}</div>
      )}

      {/* Left panel — World logs */}
      <div className="logs-panel">
        {worldData.logs.length === 0 ? (
          <div className="log-card">
            <p className="log-content" style={{ color: 'var(--text-ghost)', fontStyle: 'italic' }}>
              世界尚未留下记忆
            </p>
          </div>
        ) : (
          [...worldData.logs].reverse().map((log) => (
            <div
              key={log.id}
              className={`log-card log-card-${log.triggeredBy}${highlightedLogId === log.worldStateId ? ' log-card-highlighted' : ''}`}
              onClick={() => handleSelectWorldState(log.worldStateId)}
            >
              <div className="log-time">{formatTime(log.timestamp)}</div>
              <p className="log-content">{log.content}</p>
            </div>
          ))
        )}
      </div>

      {/* Right panel — Causal timeline */}
      <div className="timeline-panel">
        {worldData.worldStates.length === 0 ? (
          <div className="timeline-card">
            <p style={{ color: 'var(--text-ghost)', fontSize: '12px', textAlign: 'center', fontStyle: 'italic' }}>
              暂无历史
            </p>
          </div>
        ) : (
          [...worldData.worldStates].reverse().map((ws, i) => (
            <div
              key={ws.id}
              className={`timeline-card${selectedWorldStateId === ws.id ? ' timeline-card-highlighted' : ''}`}
              onClick={() => handleSelectWorldState(ws.id)}
            >
              {i > 0 && <div className="timeline-connector" />}
              <div className={`timeline-dot timeline-dot-${ws.triggeredBy}`} />
              <div className="timeline-time">{formatTime(ws.timestamp)}</div>
              <p className="timeline-interp">{ws.interpretation}</p>
            </div>
          ))
        )}
      </div>

      {/* Center column — Camera, world image, echo, status */}
      <div className="world-center">
        {/* Mode toggle — 静观｜自生, above wait-prompt */}
        <div className="evolve-mode-toggle">
          <button onClick={handleToggleMode} className={`mode-pill ${evolveMode === 'manual' ? 'mode-pill-active' : ''}`}>
            静观
          </button>
          <span className="mode-separator">｜</span>
          <button onClick={handleToggleMode} className={`mode-pill ${evolveMode === 'auto' ? 'mode-pill-active' : ''}`}>
            自生
          </button>
        </div>

        {/* 等待介入提示 — 位于摄像头框上方 */}
        {evolveMode !== 'auto' && (
          <div className="wait-prompt">世界等待你的介入</div>
        )}

        {/* 自主模式状态 — 文字 + 间隔调整，位于摄像头框上方 */}
        {evolveMode === 'auto' && (
          <div className="auto-mode-status">
            <span>世界在自行生长</span>
            <div className="evolve-interval-control">
              <span className="interval-label">每</span>
              <input
                type="number"
                min={1}
                max={60}
                value={evolveInterval}
                onChange={(e) => handleIntervalChange(Number(e.target.value))}
                className="interval-input"
              />
              <span className="interval-label">分钟</span>
            </div>
          </div>
        )}

        {/* Camera pip — above world image, centered */}
        <div className="camera-pip">
          {!cameraReady && !cameraOpening && !cameraError && (
            <button onClick={openCamera} className="camera-toggle-btn" title="打开摄像头">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 7l-7 5 7 5V7z"/>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
            </button>
          )}
          {cameraOpening && <div className="camera-pip-msg">连接中…</div>}
          {cameraError ? (
            <div className="camera-pip-msg">{cameraError}</div>
          ) : cameraReady ? (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="camera-pip-video" />
            </>
          ) : null}
          {uploadedPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={uploadedPreview} alt="上传的图片" className="camera-pip-upload" />
          )}
        </div>

        {/* World image with radial mask fade */}
        {currentWorld ? (
          <div className="world-image-wrap">
            <div className="world-glow-layer" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentWorld.imageUrl} alt="世界画面" className="world-img" />
            <div className="world-img-mask" />
          </div>
        ) : (
          <div className="world-void">
            <p className="void-text">{isBusy ? (statusMsg || '处理中…') : '世界尚未诞生'}</p>
            {!isBusy && <p className="void-sub">摆下积木，开始介入</p>}
          </div>
        )}

        {/* World echo — typewriter text */}
        <div className="world-echo">
          {displayedText && (
            <span className="echo-text">{displayedText}</span>
          )}
        </div>

        {/* Status — scan shape info */}
        <div className="world-status">
          {lastScan && lastScan.shapes.length > 0 ? (
            <div className="scan-info-display">
              {(() => {
                const shapeCounts: Record<string, number> = {}
                lastScan.shapes.forEach(s => {
                  const name = shapeNameMap[s.type] || s.type
                  shapeCounts[name] = (shapeCounts[name] || 0) + 1
                })
                const shapeTags = Object.entries(shapeCounts)
                  .map(([name, count]) => `${name} × ${count}`)
                  .join('  ')
                return (
                  <>
                    <span className={`scan-intent scan-intent-${lastScan.userIntent}`}>
                      {lastScan.userIntent === 'agree' ? '继续这个方向' :
                       lastScan.userIntent === 'reject' ? '换个方向' :
                       lastScan.userIntent === 'modify' ? '做出修正' :
                       lastScan.userIntent === 'initial' ? '初次介入' : ''}
                    </span>
                    <span className="scan-shapes-label">{shapeTags}</span>
                    {lastScan.spatialRelationships && (
                      <span className="scan-spatial-note">{lastScan.spatialRelationships}</span>
                    )}
                  </>
                )
              })()}
            </div>
          ) : (
            null
          )}
        </div>
      </div>

      {/* Bottom controls bar */}
      <div className="controls-bar">
        <div className="controls-row">
          <button onClick={handleScan} disabled={isBusy || !cameraReady} className={`scan-btn${phase === 'scanning' ? ' scan-btn-ripple' : ''}`}>
            {isBusy ? '处理中…' : '扫描'}
          </button>
          <button onClick={handleEvolveManual} disabled={isBusy} className="evolve-once-btn" title="演化一次">
            {/* Ancient Greek triskelion spiral — three-legged meander */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M12 12 C12 8, 8 6, 5 7 C8 7, 11 9, 12 12"/>
              <path d="M12 12 C14 10, 16 7, 17 4 C17 7, 14 10, 12 12"/>
              <path d="M12 12 C14 14, 16 17, 14 20 C14 17, 13 15, 12 12"/>
              <path d="M12 12 C10 14, 7 17, 4 16 C7 16, 10 14, 12 12"/>
              <path d="M12 12 C10 10, 7 7, 10 4 C10 7, 11 9, 12 12"/>
              <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
            </svg>
          </button>
          <button onClick={handleUploadClick} disabled={isBusy} className="upload-btn">
            上传图片
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
        <button onClick={handleEndIntervention} className="end-btn">
          结束介入
        </button>
      </div>

      {/* Reset button — top-right corner */}
      <button onClick={handleRestart} disabled={isBusy} className="reset-fixed" title="重新开始">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
      </button>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
