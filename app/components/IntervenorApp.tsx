'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import type { WorldState, LogEntry, ScanResult, ShapeObject } from '@/types'

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
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null)

  // Evolution mode state
  const [evolveMode, setEvolveMode] = useState<EvolveMode>('manual')
  const [evolveInterval, setEvolveInterval] = useState(5) // minutes
  const evolveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // Connect stream to video element once it mounts
  useEffect(() => {
    if (cameraReady && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [cameraReady])

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
  const runPipeline = useCallback(async (base64: string, mimeType = 'image/jpeg') => {
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
    setCapturedPreview(null)

    try {
      await runPipeline(base64, 'image/jpeg')
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
        await runPipeline(base64, mimeType)
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

  const handleSelectWorldState = useCallback((worldStateId: string) => {
    if (worldStateId === latestWorldState?.id) {
      setSelectedWorldStateId(null)
      return
    }

    setSelectedWorldStateId(worldStateId)
  }, [latestWorldState?.id])

  const handleReturnToCurrentWorld = useCallback(() => {
    setSelectedWorldStateId(null)
  }, [])

  const isBusy = phase === 'scanning' || phase === 'interpreting' || phase === 'generating'

  return (
    <div className="intervener-layout">
      {/* LEFT AREA — "Desk Surface": world image + camera + controls */}
      <div className="left-panel">

        {/* ① World image — the main generated frame */}
        <div className="world-image-area">
          {currentWorld ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentWorld.imageUrl} alt="世界画面" className="world-img" />
          ) : (
            <div className="world-placeholder">
              <span className="placeholder-text">世界尚未诞生</span>
              <span className="placeholder-sub">摆下积木，开始介入</span>
            </div>
          )}

          {currentWorld && (
            <div className="world-caption">
              <span className="caption-text">{currentWorld.interpretation}</span>
              <div className="caption-badges">
                {isBrowsingHistory && (
                  <button onClick={handleReturnToCurrentWorld} className="caption-badge badge-history" title="返回当前世界">
                    历史快照
                  </button>
                )}
                <span className={`caption-badge ${currentWorld.triggeredBy === 'user' ? 'badge-user' : 'badge-ai'}`}>
                  {currentWorld.triggeredBy === 'user' ? '用户介入' : 'AI自主'}
                </span>
              </div>
            </div>
          )}

          {/* ② Camera PIP — floating camera/upload preview */}
          <div className="camera-float">
            {!cameraReady && !cameraOpening && !cameraError && (
              <button onClick={openCamera} className="camera-toggle-btn" title="打开摄像头">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 7l-7 5 7 5V7z"/>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
              </button>
            )}
            {cameraOpening && <div className="camera-float-error">正在打开摄像头…</div>}
            {cameraError ? (
              <div className="camera-float-error">{cameraError}</div>
            ) : cameraReady ? (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="camera-float-video" />
                <button onClick={closeCamera} className="camera-close-btn" title="关闭摄像头">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </>
            ) : null}
            {uploadedPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={uploadedPreview} alt="上传的图片" className="camera-float-upload" />
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* ③ Controls — scan, upload, evolve */}
        <div className="controls-bar">
          <div className="controls-row">
            <button onClick={handleScan} disabled={isBusy || !cameraReady} className="scan-btn">
              {isBusy ? '处理中…' : '扫描'}
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
            <button onClick={handleRestart} disabled={isBusy} className="restart-btn" title="重新开始">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
          </div>

          {/* Evolution mode controls */}
          <div className="evolve-controls">
            <div className="evolve-mode-row">
              <button
                onClick={handleEvolveManual}
                disabled={isBusy}
                className="evolve-once-btn"
                title="让世界演化一次"
              >
                演化一次
              </button>
              <div className="evolve-mode-toggle">
                <button
                  onClick={handleToggleMode}
                  className={`mode-pill ${evolveMode === 'manual' ? 'mode-pill-active' : ''}`}
                >
                  静观
                </button>
                <button
                  onClick={handleToggleMode}
                  className={`mode-pill ${evolveMode === 'auto' ? 'mode-pill-active' : ''}`}
                >
                  自生
                </button>
              </div>
              {evolveMode === 'auto' && (
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
              )}
            </div>
            <div className="evolve-status">
              {evolveMode === 'auto'
                ? `世界在自行生长 · 每 ${evolveInterval} 分钟一次`
                : '世界等待你的介入'}
            </div>
          </div>

          {statusMsg && (
            <div className="status-bar">
              {isBusy && <span className="status-dot" />}
              <span>{statusMsg}</span>
            </div>
          )}

          {lastScan && !isBusy && (
            <div className="scan-meta">
              <span className="scan-intent">{intentLabel[lastScan.userIntent]}</span>
              <span className="scan-shapes">{formatShapesAsNarrative(lastScan.shapes)}</span>
              {lastScan.changeDescription && (
                <p className="scan-change-desc">{lastScan.changeDescription}</p>
              )}
            </div>
          )}

          {/* Debug: captured image preview */}
          {capturedPreview && (
            <div className="debug-capture-preview">
              <div className="debug-capture-label">拍摄快照</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={capturedPreview} alt="captured frame" className="debug-capture-img" />
            </div>
          )}
        </div>
      </div>

      {/* RIGHT AREA — "Observation Notebook": echo + logs + timeline */}
      <div className="right-panel">
        {/* ④ World echo + logs */}
        <div className="interp-section">
          <h2 className="section-title">世界的回声</h2>
          {currentWorld ? (
            <>
              <div className="interp-meta">
                <span className="interp-time">{formatTime(currentWorld.timestamp)}</span>
                <span className={`interp-source ${currentWorld.triggeredBy === 'user' ? 'badge-user' : 'badge-ai'}`}>
                  {currentWorld.triggeredBy === 'user' ? '用户介入' : 'AI自主'}
                </span>
                {isBrowsingHistory && (
                  <button onClick={handleReturnToCurrentWorld} className="return-current-btn">
                    回到当前世界
                  </button>
                )}
              </div>
              <p className="interp-text">{currentWorld.interpretation}</p>
              {isBrowsingHistory && <p className="interp-note">这是一段仍被保存的世界记忆。此刻的世界仍在继续生长。</p>}
            </>
          ) : latestInterpretation ? (
            <p className="interp-text">{latestInterpretation}</p>
          ) : (
            <p className="interp-empty">等待第一次介入……</p>
          )}
        </div>

        <div className="logs-section">
          <h2 className="section-title">世界日志</h2>
          <div className="logs-scroll">
            {worldData.logs.length === 0 ? (
              <p className="logs-empty">世界尚未留下记忆。</p>
            ) : (
              [...worldData.logs].reverse().map((log) => (
                <div
                  key={log.id}
                  className={`log-entry ${log.worldStateId === currentWorld?.id ? 'log-entry-active' : ''}`}
                  onClick={() => handleSelectWorldState(log.worldStateId)}
                >
                  <div className="log-meta">
                    <span className={`log-badge ${log.triggeredBy === 'user' ? 'badge-user' : 'badge-ai'}`}>
                      {log.triggeredBy === 'user' ? '用户介入' : 'AI自主'}
                    </span>
                    <span className="log-time">{formatTime(log.timestamp)}</span>
                  </div>
                  <p className="log-content">{log.content}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ⑤ Causal timeline */}
        <div className="timeline-section">
          <h2 className="section-title">因果时间线</h2>
          <div className="timeline-scroll">
            {worldData.worldStates.length === 0 ? (
              <p className="timeline-empty">暂无历史。</p>
            ) : (
              [...worldData.worldStates].reverse().map((ws) => (
                <div
                  key={ws.id}
                  className={`timeline-item ${ws.id === currentWorld?.id ? 'timeline-item-active' : ''}`}
                  onClick={() => handleSelectWorldState(ws.id)}
                >
                  <div className={`timeline-dot ${ws.triggeredBy === 'user' ? 'dot-user' : 'dot-ai'}`} />
                  <div className="timeline-body">
                    <span className={`timeline-badge ${ws.triggeredBy === 'user' ? 'badge-user' : 'badge-ai'}`}>
                      {ws.triggeredBy === 'user' ? '用户介入' : 'AI自主演化'}
                    </span>
                    <span className="timeline-time">{formatTime(ws.timestamp)}</span>
                    <p className="timeline-interp">{ws.interpretation}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
