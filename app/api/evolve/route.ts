import OpenAI from 'openai'
import { getLatestWorldState, addWorldState, addLog } from '@/lib/store'
import type { WorldState, LogEntry } from '@/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const STYLE_SUFFIX =
  '2D layered paper cut illustration, visible depth between layers with drop shadows, grainy film texture overlay, rough edges, screen printing aesthetic, coarse grain noise, visible layer separation with dark shadow gaps between foreground midground and background, hand-crafted feel, NOT smooth NOT glossy NOT photorealistic, dark moody palette, warm amber light source, silhouette foreground layer, atmospheric haze in background, imperfect textures, risograph printing style, no text, no letters'

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

  // Generate image
  const prompt = `${interpretation}, ${STYLE_SUFFIX}`
  const imageResponse = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1792x1024',
    quality: 'standard',
  })

  const imageUrl = imageResponse.data?.[0]?.url ?? ''

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
