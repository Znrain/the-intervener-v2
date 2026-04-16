'use server'

import OpenAI from 'openai'
import sharp from 'sharp'
import { getLatestWorldState, addWorldState, addLog } from '@/lib/store'
import type { WorldState, LogEntry } from '@/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const TARGET_W = 1792
const TARGET_H = 1024
const GEN_SIZE = '1024x1024'

// AI autonomous evolution style: same visual language, but more freedom
const EVOLVE_STYLE = `STYLE:
Poetic narrative illustration, hand-painted flat shapes, organic natural forms, environmental scene composition, storybook-like illustration, soft grain texture, gouache or screenprint feel, slightly imperfect edges, atmospheric and lyrical, full-scene composition. Not geometric, not a centered symbolic poster, not polished vector design. No shadows, no 3D, no material thickness, no photorealism, no heavy outlines, no glossy rendering, no ornate decorative borders, no tarot-card framing, no symmetrical poster layouts, no text, no letters.

SHAPE GUIDANCE (LOOSE):
When natural forms appear, prefer organic environmental elements over pure geometric abstraction:
- circular forms → moons, suns, fruits, tree canopies, light sources, openings
- curved forms → flowing water, hills, branches, wind paths, shorelines
- angular forms → mountains, rooftops, rock formations, tree tops
- small scattered elements → stars, seeds, leaves, dust, fireflies, distant birds
- linear elements → horizons, paths, rivers, branches, light rays

This is guidance, not a strict rule. The world may evolve in unexpected directions.`

export async function POST() {
  const latest = getLatestWorldState()

  // Decide the next evolution direction
  const evolvePrompt = latest
    ? `当前世界状态：${latest.interpretation}
世界在无人干预的情况下自然演化了一步。请描述世界接下来会发生什么变化（一句话，中文，诗意风格，不超过25字）。`
    : `世界从虚无中诞生，请描述它最初的样子（一句话，中文，诗意风格，不超过25字）。`

  const evolveResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `你是一个正在自主生长的AI世界。${evolvePrompt}`,
      },
      { role: 'user', content: '请演化。' },
    ],
    max_tokens: 80,
  })

  const interpretation =
    evolveResponse.choices[0].message.content?.trim() ?? '世界在沉默中生长'

  // Generate log entry
  const logResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `你是一个正在自主生长的AI世界，用第一人称写日记。
${latest ? `上一刻：${latest.interpretation}` : '这是世界的诞生。'}
此刻的变化：${interpretation}

请写一段世界日记，2-3句话，第一人称，中文，描述这次自主演化的感受。
风格：内省、诗意，类似《光遇》游戏中的旁白。`,
      },
      { role: 'user', content: '请写日记。' },
    ],
    max_tokens: 120,
  })

  const logContent =
    logResponse.choices[0].message.content?.trim() ?? '我在黑暗中悄悄改变了形状。'

  // Build prompt with FRAME constraint + MOOD + EVOLVE_STYLE
  const promptParts: string[] = []

  // FRAME — full-frame composition constraint
  promptParts.push(
    `[FRAME — COMPOSITION CONSTRAINT]
The image MUST be composed for a 16:9 aspect ratio and fill the entire frame.
Do NOT leave empty or flat background areas. Background must be part of the composition, not a blank fill.
Elements should extend toward edges to create a complete scene. Avoid centered isolated objects on empty background.
Design the scene as a full composition that fills the entire frame, not a single object on a blank background.
Expand the scene by adding atmospheric surroundings — gradients, color fields, organic forms, mist, or subtle environmental texture — so the entire canvas is intentionally composed.`
  )

  // MOOD — the poetic interpretation
  promptParts.push(
    `[MOOD / ATMOSPHERE]\n${interpretation}\n\nThis section affects tone, feeling, and color atmosphere. The world is evolving autonomously.`
  )

  // STYLE — loose shape guidance
  promptParts.push(EVOLVE_STYLE)

  const prompt = promptParts.join('\n\n---\n\n')

  console.log('[API/evolve] DALL-E prompt:', prompt)

  // Generate at 1024x1024 (square) — DALL-E composes the full square
  const imageResponse = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: GEN_SIZE as '1024x1024',
    quality: 'standard',
  })

  const rawUrl = imageResponse.data?.[0]?.url ?? ''
  console.log('[API/evolve] DALL-E raw URL:', rawUrl)

  if (!rawUrl) {
    throw new Error('DALL-E returned no image URL')
  }

  // Download the raw image
  const imageResp = await fetch(rawUrl)
  const imageBuffer = Buffer.from(await imageResp.arrayBuffer())

  // Crop center 16:9 from the 1024x1024 square, then resize to 1792x1024
  const cropHeight = Math.round(1024 * (9 / 16)) // 576
  const cropTop = Math.round((1024 - cropHeight) / 2) // 224

  const croppedBuffer = await sharp(imageBuffer)
    .extract({ left: 0, top: cropTop, width: 1024, height: cropHeight })
    .resize(TARGET_W, TARGET_H, { fit: 'fill' })
    .jpeg({ quality: 92 })
    .toBuffer()

  // Upload cropped image to a data URL for storage
  const croppedBase64 = croppedBuffer.toString('base64')
  const imageUrl = `data:image/jpeg;base64,${croppedBase64}`

  console.log('[API/evolve] Cropped & resized to', TARGET_W, 'x', TARGET_H)

  const worldState: WorldState = {
    id: `world_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    imageUrl,
    interpretation,
    timestamp: Date.now(),
    triggeredBy: 'ai',
  }

  const logEntry: LogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    content: logContent,
    timestamp: Date.now(),
    triggeredBy: 'ai',
    worldStateId: worldState.id,
  }

  addWorldState(worldState)
  addLog(logEntry)

  return Response.json({ worldState, logEntry })
}
