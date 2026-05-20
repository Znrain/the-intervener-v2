'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import html2canvas from 'html2canvas'
import type { WorldState, LogEntry } from '@/types'
import './MobileJournal.css'
import './MobileJournal.css'

interface JournalData {
  worldStates: WorldState[]
  logs: LogEntry[]
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}
function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function ExportModal({ isOpen, onClose, onExport }: { isOpen: boolean; onClose: () => void; onExport: () => void }) {
  if (!isOpen) return null
  return (
    <div className="mj-modal-overlay" onClick={onClose}>
      <div className="mj-modal" onClick={e => e.stopPropagation()}>
        <h3>导出世界日志</h3>
        <p>将生成一张精美的日志海报图</p>
        <div className="mj-modal-btns">
          <button className="mj-modal-confirm" onClick={onExport}>确认导出</button>
          <button className="mj-modal-cancel" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  )
}

export default function MobileJournal() {
  const router = useRouter()
  const [data, setData] = useState<JournalData | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    Promise.all([fetch('/api/world'), fetch('/api/logs')])
      .then(([wr, lr]) => Promise.all([wr.json(), lr.json()]))
      .then(([worldData, logsData]) => setData({
        worldStates: worldData.worldStates || [],
        logs: logsData.logs || [],
      }))
      .catch(() => {})
  }, [])

  const handleExport = async () => {
    if (!data) return
    setShowModal(false)
    setIsExporting(true)

    const worldStates = data.worldStates
    const userCount = worldStates.filter(w => w.triggeredBy === 'user').length
    const aiCount = worldStates.filter(w => w.triggeredBy === 'ai').length
    const today = formatDate(Date.now())

    let entriesHtml = ''
    worldStates.forEach((ws, i) => {
      const isLast = i === worldStates.length - 1
      const tagColor = ws.triggeredBy === 'user' ? '#c89030' : '#4a80b0'
      const tagText = ws.triggeredBy === 'user' ? '用户介入' : 'AI自主演化'
      const timeText = formatTime(ws.timestamp)
      const logForWs = data.logs.find(l => l.worldStateId === ws.id)

      entriesHtml += `
        <div style="display:flex;flex-direction:column;gap:8px;padding-bottom:${isLast ? '0' : '24px'};position:relative;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:10px;height:10px;border-radius:50%;background:${tagColor};box-shadow:0 0 8px ${tagColor.replace('#', 'rgba(').replace(/(.{2})(.{2})(.{2})/, (_, r, g, b) => `${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, 0.5)`)};"></div>
            <span style="font-size:11px;color:#8a6a3a;letter-spacing:0.06em;">${timeText}</span>
            <span style="font-size:11px;letter-spacing:0.08em;color:${tagColor};">${tagText}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr;gap:8px;">
            <div style="position:relative;width:100%;aspect-ratio:16/9;border-radius:6px;overflow:hidden;">
              <img src="${ws.imageUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;border:1px solid rgba(160,120,48,0.2);" />
            </div>
            ${ws.scanImageUrl && ws.triggeredBy === 'user' ? `
            <div style="position:relative;width:100%;aspect-ratio:4/3;border-radius:6px;overflow:hidden;">
              <img src="${ws.scanImageUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;border:1px solid rgba(160,120,48,0.2);" />
            </div>
            ` : ''}
            <p style="font-size:14px;color:#3a2810;line-height:1.8;margin:0;font-style:italic;letter-spacing:0.04em;">${ws.interpretation || '（无解读）'}</p>
            ${logForWs ? `<p style="font-family:'Noto Serif SC',serif;font-size:13px;color:#3a2810;line-height:1.9;margin:0;letter-spacing:0.05em;">${logForWs.content}</p>` : ''}
          </div>
        </div>
      `
    })

    const textureSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity="0.5"/></svg>`
    const textureUri = `data:image/svg+xml;base64,${Buffer.from(textureSvg).toString('base64')}`

    const posterHtml = `
      <div id="mj-poster" style="position:relative;width:420px;background:linear-gradient(160deg,#f5edd8 0%,#ede0c4 40%,#e8d9b8 70%,#d9c9a0 100%);padding:40px 28px 36px;font-family:'PingFang SC','Noto Serif SC',serif;color:#2a1f0e;box-sizing:border-box;">
        <div style="position:absolute;inset:0;background-image:url('${textureUri}');background-repeat:repeat;background-size:150px 150px;opacity:1;pointer-events:none;z-index:1;"></div>
        <div style="position:relative;z-index:2;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="font-size:22px;font-weight:normal;letter-spacing:0.25em;color:#5a3a10;margin:0 0 6px 0;">介入者 · 世界日志</h1>
            <p style="font-size:11px;color:#8a6a3a;letter-spacing:0.12em;margin:0;">${today}</p>
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
            <div style="flex:1;height:1px;background:linear-gradient(to right,transparent,#b08030 30%,#b08030 70%,transparent);"></div>
            <span style="font-size:9px;color:#b08030;">✦</span>
            <div style="flex:1;height:1px;background:linear-gradient(to right,transparent,#b08030 30%,#b08030 70%,transparent);"></div>
          </div>
          ${entriesHtml}
          <div style="display:flex;align-items:center;gap:10px;margin-top:20px;">
            <div style="flex:1;height:1px;background:linear-gradient(to right,transparent,#b08030 30%,#b08030 70%,transparent);"></div>
            <span style="font-size:9px;color:#b08030;">✦</span>
            <div style="flex:1;height:1px;background:linear-gradient(to right,transparent,#b08030 30%,#b08030 70%,transparent);"></div>
          </div>
          <div style="text-align:center;margin-top:20px;padding-top:16px;border-top:1px solid rgba(160,120,48,0.2);">
            <div style="display:flex;justify-content:center;gap:16px;margin-bottom:8px;font-size:11px;letter-spacing:0.08em;">
              <span style="color:#8a5a10;">介入 × ${userCount}</span>
              <span style="color:#2a5080;">演化 × ${aiCount}</span>
            </div>
            <p style="font-size:10px;color:#a08050;letter-spacing:0.1em;margin:0;">由介入者系统生成</p>
          </div>
        </div>
      </div>
    `

    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1'
    document.body.appendChild(container)
    container.innerHTML = posterHtml

    try {
      const canvas = await html2canvas(container.querySelector('#mj-poster') as HTMLElement, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      })
      const link = document.createElement('a')
      link.download = `介入者世界日志_${Date.now()}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      console.error('Export failed:', err)
      alert('导出失败，请重试')
    } finally {
      document.body.removeChild(container)
      setIsExporting(false)
    }
  }

  if (!data) {
    return <div className="mj-root loading"><div className="mj-loading">正在加载…</div></div>
  }

  if (data.worldStates.length === 0) {
    return (
      <div className="mj-root empty">
        <div className="mj-empty">
          <p>暂无世界日志</p>
          <button onClick={() => router.push('/m/world')}>返回世界</button>
        </div>
      </div>
    )
  }

  const userCount = data.worldStates.filter(w => w.triggeredBy === 'user').length
  const aiCount = data.worldStates.filter(w => w.triggeredBy === 'ai').length
  const today = formatDate(Date.now())

  return (
    <div className="mj-root">
      {/* Flame particles */}
      <div className="mj-flame-overlay" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="mj-flame-particle" style={{
            width: 4 + (i % 3) * 2,
            height: 4 + (i % 3) * 2,
            left: `${10 + i * 12}%`,
            bottom: '-10px',
            animation: `mjFlame${i % 3} ${8 + i * 1.5}s linear ${i * 0.8}s infinite`,
          }} />
        ))}
      </div>

      {/* Header */}
      <header className="mj-header">
        <button className="mj-back-btn" onClick={() => router.push('/m/world')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          返回
        </button>
        <h1 className="mj-title">介入者 · 世界日志</h1>
        <div className="mj-date">{today}</div>
      </header>

      {/* Timeline */}
      <main className="mj-main scrollable">
        <div className="mj-book">
          <div className="mj-rule">
            <span className="mj-rule-line" />
            <span className="mj-rule-ornament">✦</span>
            <span className="mj-rule-line" />
          </div>

          {data.worldStates.map(ws => {
            const logForWs = data.logs.find(l => l.worldStateId === ws.id)
            return (
              <div key={ws.id} className={`mj-entry entry-${ws.triggeredBy}`}>
                <div className="mj-entry-node">
                  <div className={`mj-dot ${ws.triggeredBy === 'user' ? 'mj-dot-user' : 'mj-dot-ai'}`} />
                </div>
                <div className="mj-entry-time">{formatTime(ws.timestamp)}</div>
                <div className={`mj-entry-tag ${ws.triggeredBy === 'user' ? 'mj-tag-user' : 'mj-tag-ai'}`}>
                  {ws.triggeredBy === 'user' ? '用户介入' : 'AI自主演化'}
                </div>
                <div className="mj-entry-body">
                  <div className="mj-image-wrap">
                    <div className={`mj-image-glow ${ws.triggeredBy === 'user' ? 'mj-glow-user' : 'mj-glow-ai'}`} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ws.imageUrl} alt="世界" className="mj-image" />
                  </div>
                  {ws.scanImageUrl && ws.triggeredBy === 'user' && (
                    <div className="mj-image-wrap">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ws.scanImageUrl} alt="用户上传" className="mj-image" />
                    </div>
                  )}
                  <p className="mj-interpretation">{ws.interpretation || '（无解读）'}</p>
                </div>
                {logForWs && (
                  <div className="mj-entry-log">
                    <p className="mj-log-text">{logForWs.content}</p>
                  </div>
                )}
              </div>
            )
          })}

          <div className="mj-rule">
            <span className="mj-rule-line" />
            <span className="mj-rule-ornament">✦</span>
            <span className="mj-rule-line" />
          </div>

          <div className="mj-stats">
            <span className="mj-stat-user">介入 × {userCount}</span>
            <span className="mj-stat-ai">演化 × {aiCount}</span>
          </div>
          <div className="mj-watermark">由介入者系统生成</div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mj-footer">
        <button className="mj-export-btn" onClick={() => setShowModal(true)} disabled={isExporting}>
          {isExporting ? '导出中…' : '导出记录'}
        </button>
      </footer>

      <ExportModal isOpen={showModal} onClose={() => setShowModal(false)} onExport={handleExport} />
    </div>
  )
}