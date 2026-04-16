'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import html2canvas from 'html2canvas'
import './journal.css'

interface WorldState {
  id: string
  imageUrl: string
  interpretation: string
  timestamp: number
  triggeredBy: 'user' | 'ai'
  scanImageUrl?: string
}

interface LogEntry {
  id: string
  content: string
  timestamp: number
  triggeredBy: 'user' | 'ai'
  worldStateId: string
}

interface JournalPageData {
  worldStates: WorldState[]
  logs: LogEntry[]
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Export modal
function ExportModal({ isOpen, onClose, onExport }: { isOpen: boolean; onClose: () => void; onExport: () => void }) {
  if (!isOpen) return null

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal" onClick={e => e.stopPropagation()}>
        <h3>导出世界日志</h3>
        <p>将生成一张精美的羊皮纸日志海报图</p>
        <div className="export-buttons">
          <button className="export-confirm-btn" onClick={onExport}>确认导出</button>
          <button className="export-cancel-btn" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  )
}

export default function JournalPage() {
  const router = useRouter()
  const [data, setData] = useState<JournalPageData | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)

  useEffect(() => {
    async function loadData() {
      try {
        const [worldRes, logsRes] = await Promise.all([
          fetch('/api/world'),
          fetch('/api/logs'),
        ])
        const worldData = await worldRes.json()
        const logsData = await logsRes.json()
        setData({
          worldStates: worldData.worldStates || [],
          logs: logsData.logs || [],
        })
      } catch (err) {
        console.error('Failed to load journal data:', err)
      }
    }
    loadData()
  }, [])

  const handleExport = async () => {
    if (!data) return
    setShowExportModal(false)
    setIsExporting(true)

    const worldStates = data.worldStates
    const userCount = worldStates.filter(w => w.triggeredBy === 'user').length
    const aiCount = worldStates.filter(w => w.triggeredBy === 'ai').length
    const today = formatDate(Date.now())

    // Build poster HTML manually
    let entriesHtml = ''
    worldStates.forEach((ws, i) => {
      const isLast = i === worldStates.length - 1
      const dotColor = ws.triggeredBy === 'user' ? '#c89030' : '#4a80b0'
      const dotShadow = ws.triggeredBy === 'user' ? 'rgba(200,144,48,0.5)' : 'rgba(74,128,176,0.5)'
      const tagColor = ws.triggeredBy === 'user' ? '#c89030' : '#4a80b0'
      const tagText = ws.triggeredBy === 'user' ? '用户介入' : 'AI自主演化'
      const timeText = formatTime(ws.timestamp)

      // Get corresponding log
      const logForWs = data.logs.find(l => l.worldStateId === ws.id)

      entriesHtml += `
        <div style="display:grid;grid-template-columns:12px 12px 1fr 40px 1fr;align-items:stretch;padding-bottom:${isLast ? '0' : '32px'};position:relative;">
          <!-- Dot -->
          <div style="grid-column:1;display:flex;justify-content:center;align-items:flex-start;padding-top:10px;">
            <div style="width:12px;height:12px;border-radius:50%;background:${dotColor};box-shadow:0 0 10px ${dotShadow};"></div>
          </div>

          <!-- Time -->
          <div style="grid-column:2;font-size:11px;color:#8a6a3a;letter-spacing:0.06em;padding-top:12px;line-height:1;align-self:flex-start;white-space:nowrap;">${timeText}</div>

          <!-- Tag (absolute positioned to left) -->
          <div style="position:absolute;left:-90px;top:23px;font-size:11px;letter-spacing:0.08em;padding:2px 4px;border-radius:999px;white-space:nowrap;color:${tagColor};">${tagText}</div>

          <!-- Image + interpretation -->
          <div style="grid-column:3;display:flex;flex-direction:column;gap:10px;padding-top:6px;">
            <div style="position:relative;width:100%;aspect-ratio:16/9;border-radius:6px;overflow:hidden;">
              <img src="${ws.imageUrl}" alt="生成画面" style="width:100%;height:100%;object-fit:cover;border-radius:6px;border:1px solid rgba(160,120,48,0.2);" />
            </div>
            ${ws.scanImageUrl && ws.triggeredBy === 'user' ? `
            <div style="position:relative;width:100%;aspect-ratio:16/9;border-radius:6px;overflow:hidden;">
              <img src="${ws.scanImageUrl}" alt="用户上传" style="width:100%;height:100%;object-fit:cover;border-radius:6px;border:1px solid rgba(160,120,48,0.2);" />
            </div>
            ` : ''}
            <p style="font-size:14px;color:#3a2810;line-height:1.8;font-style:italic;letter-spacing:0.04em;margin:0;">${ws.interpretation || '（无解读）'}</p>
          </div>

          <!-- AI log text -->
          ${logForWs ? `
          <div style="grid-column:5;display:flex;align-items:stretch;padding-top:6px;">
            <p style="font-family:'ZCOOL XiaoWei','Noto Serif SC','STKaiti','KaiTi','楷体','STSong','SimSun',serif;font-size:13px;color:#3a2810;letter-spacing:0.06em;line-height:1.9;margin:0;width:100%;">${logForWs.content}</p>
          </div>
          ` : ''}
        </div>
      `
    })

    // Aged parchment texture: fractalNoise SVG baked into base64 URI, applied via CSS filter
    const textureSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity="0.5"/></svg>`
    const textureUri = `data:image/svg+xml;base64,${Buffer.from(textureSvg).toString('base64')}`

    const posterHtml = `
      <div id="parchment-poster" style="position:relative;width:1400px;background:linear-gradient(160deg,#f5edd8 0%,#ede0c4 40%,#e8d9b8 70%,#d9c9a0 100%);padding:56px 120px 48px;font-family:'PingFang SC','Hiragino Sans GB','Noto Serif SC',serif;color:#2a1f0e;box-sizing:border-box;">
        <div style="position:absolute;inset:0;background-image:url('${textureUri}');background-repeat:repeat;background-size:180px 180px;opacity:1;pointer-events:none;z-index:1;"></div>
        <div style="position:relative;z-index:2;">
        <div style="text-align:center;margin-bottom:40px;">
          <h1 style="font-size:28px;font-weight:normal;letter-spacing:0.3em;color:#5a3a10;margin:0 0 8px 0;text-shadow:0 1px 0 rgba(255,255,255,0.4);">介入者 · 世界日志</h1>
          <p style="font-size:12px;color:#8a6a3a;letter-spacing:0.15em;">${today}</p>
        </div>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:36px;">
          <div style="flex:1;height:1px;background:linear-gradient(to right,transparent,#b08030 30%,#b08030 70%,transparent);"></div>
          <span style="font-size:10px;color:#b08030;letter-spacing:0.1em;">✦</span>
          <div style="flex:1;height:1px;background:linear-gradient(to right,transparent,#b08030 30%,#b08030 70%,transparent);"></div>
        </div>
        <div style="position:relative;">
          <!-- Timeline spine -->
          <div style="position:absolute;left:6px;top:16px;bottom:16px;width:1px;background:linear-gradient(to bottom,rgba(200,144,48,0.3),rgba(74,128,176,0.3));"></div>
          ${entriesHtml}
        </div>
        <div style="display:flex;align-items:center;gap:14px;margin-top:32px;">
          <div style="flex:1;height:1px;background:linear-gradient(to right,transparent,#b08030 30%,#b08030 70%,transparent);"></div>
          <span style="font-size:10px;color:#b08030;letter-spacing:0.1em;">✦</span>
          <div style="flex:1;height:1px;background:linear-gradient(to right,transparent,#b08030 30%,#b08030 70%,transparent);"></div>
        </div>
        <div style="text-align:center;margin-top:32px;padding-top:20px;border-top:1px solid rgba(160,120,48,0.2);">
          <div style="display:flex;justify-content:center;gap:24px;margin-bottom:12px;font-size:12px;letter-spacing:0.1em;">
            <span style="color:#8a5a10;">介入 × ${userCount}</span>
            <span style="color:#2a5080;">演化 × ${aiCount}</span>
          </div>
          <p style="font-size:10px;color:#a08050;letter-spacing:0.12em;margin:0;">由介入者系统生成</p>
        </div>
        </div>
      </div>
    `

    // Mount hidden poster
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1'
    document.body.appendChild(container)
    container.innerHTML = posterHtml

    try {
      const canvas = await html2canvas(container.querySelector('#parchment-poster') as HTMLElement, {
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
    return (
      <div className="journal-root loading">
        <div className="loading-text">正在加载日志...</div>
      </div>
    )
  }

  if (data.worldStates.length === 0) {
    return (
      <div className="journal-root empty">
        <div className="empty-content">
          <p className="empty-text">暂无世界日志</p>
          <button className="back-btn" onClick={() => router.push('/world')}>
            返回世界
          </button>
        </div>
      </div>
    )
  }

  const today = formatDate(Date.now())
  const userCount = data.worldStates.filter(w => w.triggeredBy === 'user').length
  const aiCount = data.worldStates.filter(w => w.triggeredBy === 'ai').length

  return (
    <div className="journal-root">
      {/* Flame particle overlay — European magic grimoire feel */}
      <div className="flame-overlay" aria-hidden="true">
        <div className="flame-particle" style={{ width: 5, height: 5, left: '12%', bottom: '-10px', animation: 'flame1 9s linear 0s infinite' }} />
        <div className="flame-particle" style={{ width: 4, height: 4, left: '28%', bottom: '-10px', animation: 'flame2 11s linear 2.5s infinite' }} />
        <div className="flame-particle" style={{ width: 7, height: 7, left: '45%', bottom: '-10px', animation: 'flame3 13s linear 5s infinite' }} />
        <div className="flame-particle" style={{ width: 3, height: 3, left: '60%', bottom: '-10px', animation: 'flame1 10s linear 1.2s infinite' }} />
        <div className="flame-particle" style={{ width: 5, height: 5, left: '75%', bottom: '-10px', animation: 'flame2 12s linear 3.8s infinite' }} />
        <div className="flame-particle" style={{ width: 4, height: 4, left: '88%', bottom: '-10px', animation: 'flame3 9.5s linear 7s infinite' }} />
        <div className="flame-particle" style={{ width: 6, height: 6, left: '20%', bottom: '-10px', animation: 'flame1 14s linear 4s infinite' }} />
        <div className="flame-particle" style={{ width: 3, height: 3, left: '50%', bottom: '-10px', animation: 'flame2 8s linear 6.5s infinite' }} />
        <div className="flame-particle" style={{ width: 5, height: 5, left: '35%', bottom: '-10px', animation: 'flame3 11s linear 0.8s infinite' }} />
        <div className="flame-particle" style={{ width: 4, height: 4, left: '68%', bottom: '-10px', animation: 'flame1 10s linear 3s infinite' }} />
        <div className="flame-particle" style={{ width: 6, height: 6, left: '82%', bottom: '-10px', animation: 'flame2 13s linear 8s infinite' }} />
        <div className="flame-particle" style={{ width: 3, height: 3, left: '8%',  bottom: '-10px', animation: 'flame3 9s linear 1.5s infinite' }} />
      </div>

      {/* Header */}
      <header className="journal-header">
        <button className="back-to-world" onClick={() => router.push('/world')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          返回世界
        </button>
        <h1 className="journal-title">介入者 · 世界日志</h1>
        <div className="page-indicator">{today}</div>
      </header>

      {/* Timeline content */}
      <main className="journal-main">
        <div className="journal-book">
          {/* Top decoration */}
          <div className="book-top-rule">
            <span className="rule-left" />
            <span className="rule-ornament">✦</span>
            <span className="rule-right" />
          </div>

          {/* Timeline */}
          <div className="timeline">
            <div className="timeline-spine" />

            {data.worldStates.map((ws, i) => {
              const logForWs = data.logs.find(l => l.worldStateId === ws.id)
              return (
              <div
                key={ws.id}
                className={`journal-entry ${ws.triggeredBy === 'user' ? 'entry-user' : 'entry-ai'}`}
              >
                {/* Dot — centered in its own column */}
                <div className="entry-node">
                  <div className={`entry-dot ${ws.triggeredBy === 'user' ? 'dot-user' : 'dot-ai'}`} />
                </div>

                {/* Time — tight to the RIGHT of the dot (12px gap) */}
                <div className="entry-time">{formatTime(ws.timestamp)}</div>

                {/* Tag — to the LEFT of the dot (12px gap) */}
                <div className={`entry-tag ${ws.triggeredBy === 'user' ? 'tag-user' : 'tag-ai'}`}>
                  {ws.triggeredBy === 'user' ? '用户介入' : 'AI自主演化'}
                </div>

                {/* Image + interpretation */}
                <div className="entry-body">
                  <div className="entry-image-wrap">
                    <div className={`entry-image-glow ${ws.triggeredBy === 'user' ? 'glow-user' : 'glow-ai'}`} />
                    <img
                      src={ws.imageUrl}
                      alt="生成画面"
                      className="entry-image"
                    />
                  </div>

                  {ws.scanImageUrl && ws.triggeredBy === 'user' && (
                    <div className="entry-image-wrap">
                      <div className={`entry-image-glow ${ws.triggeredBy === 'user' ? 'glow-user' : 'glow-ai'}`} />
                      <img
                        src={ws.scanImageUrl}
                        alt="用户上传"
                        className="entry-image"
                      />
                    </div>
                  )}

                  <p className="entry-interpretation">
                    {ws.interpretation || '（无解读）'}
                  </p>
                </div>

                {/* AI journal entry — right side, height matches image */}
                {logForWs && (
                  <div className="entry-right">
                    <p className="journal-entry-text">{logForWs.content}</p>
                  </div>
                )}
              </div>
              )
            })}
          </div>

          {/* Bottom decoration */}
          <div className="book-bottom-rule">
            <span className="rule-left" />
            <span className="rule-ornament">✦</span>
            <span className="rule-right" />
          </div>

          {/* Stats */}
          <div className="book-stats">
            <span className="stat stat-user">介入 × {userCount}</span>
            <span className="stat stat-ai">演化 × {aiCount}</span>
          </div>

          {/* Watermark */}
          <div className="book-watermark">由介入者系统生成</div>
        </div>
      </main>

      {/* Footer */}
      <footer className="journal-footer">
        <button
          className="export-btn"
          onClick={() => setShowExportModal(true)}
          disabled={isExporting}
        >
          {isExporting ? '导出中...' : '导出记录'}
        </button>
      </footer>

      {/* Export modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
      />
    </div>
  )
}
