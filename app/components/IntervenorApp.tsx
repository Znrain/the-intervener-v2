'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import type { WorldState, LogEntry, ScanResult } from '@/types'

type Phase = 'idle' | 'scanning' | 'interpreting' | 'generating' | 'done'

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
}

export default function IntervenorApp() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [statusMsg, setStatusMsg] = useState<string>('')
  const [lastScan, setLastScan] = useState<ScanResult | null>(null)
  const [worldData, setWorldData] = useState<WorldData>({ worldStates: [], logs: [] })
  const [latestInterpretation, setLatestInterpretation] = useState<string>('')
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/world')
      .then((r) => r.json())
      .then((data: WorldData) => setWorldData(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          setCameraReady(true)
        }
      })
      .catch(() => {
        setCameraError('无法访问摄像头')
      })

    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream
        stream.getTracks().forEach((t) => t.stop())
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
    setPhase('scanning')
    setStatusMsg('正在识别形状……')

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
    setLastScan(scan)
    setStatusMsg(`识别完成：${scan.shapes.join('、') || '未识别到形状'}`)

    setPhase('interpreting')
    setStatusMsg('正在解读……')

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
    setLatestInterpretation(interpretation)
    setStatusMsg(`解读：${interpretation}`)

    setPhase('generating')
    setStatusMsg('正在生成世界画面……')

    const genRes = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interpretation, spatialDescription, logEntry, triggeredBy: 'user' }),
    })
    if (!genRes.ok) {
      const err = await genRes.json().catch(() => ({ error: '未知错误' }))
      throw new Error(err.error ?? '生成接口错误')
    }

    await refreshWorld()
    setStatusMsg('世界已更新')
    setPhase('done')
  }, [refreshWorld])

  const handleScan = useCallback(async () => {
    if (phase !== 'idle' && phase !== 'done') return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) { setStatusMsg('摄像头未就绪'); return }

    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
    setUploadedPreview(null)

    try {
      await runPipeline(base64, 'image/jpeg')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '出现错误，请重试'
      setStatusMsg(msg)
      setPhase('idle')
      console.error(err)
    }
  }, [phase, runPipeline])

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
    setStatusMsg('')
    setPhase('idle')
  }, [phase])

  const handleEvolve = useCallback(async () => {
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

  const currentWorld =
    worldData.worldStates.length > 0
      ? worldData.worldStates[worldData.worldStates.length - 1]
      : null

  const isBusy = phase === 'scanning' || phase === 'interpreting' || phase === 'generating'

  return (
    <div className="intervener-layout">
      {/* LEFT PANEL */}
      <div className="left-panel">

        {/* World image — fixed window, camera floats inside */}
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
              <span className={`caption-badge ${currentWorld.triggeredBy === 'user' ? 'badge-user' : 'badge-ai'}`}>
                {currentWorld.triggeredBy === 'user' ? '用户介入' : 'AI自主'}
              </span>
            </div>
          )}

          {/* Floating camera PIP */}
          <div className="camera-float">
            {cameraError ? (
              <div className="camera-float-error">{cameraError}</div>
            ) : (
              <video ref={videoRef} autoPlay playsInline muted className="camera-float-video" />
            )}
            {uploadedPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={uploadedPreview} alt="上传的图片" className="camera-float-upload" />
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Controls bar */}
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
            <button onClick={handleEvolve} disabled={isBusy} className="evolve-btn">
              自主演化
            </button>
            <button onClick={handleRestart} disabled={isBusy} className="restart-btn" title="重新开始">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
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
              <span className="scan-shapes">{lastScan.shapes.join(' · ')}</span>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="right-panel">
        <div className="interp-section">
          <h2 className="section-title">世界的回声</h2>
          {latestInterpretation ? (
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
                <div key={log.id} className="log-entry">
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

        <div className="timeline-section">
          <h2 className="section-title">因果时间线</h2>
          <div className="timeline-scroll">
            {worldData.worldStates.length === 0 ? (
              <p className="timeline-empty">暂无历史。</p>
            ) : (
              [...worldData.worldStates].reverse().map((ws) => (
                <div key={ws.id} className="timeline-item">
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
