import OpenAI from 'openai'
import { getLatestWorldState } from '@/lib/store'
import type { ScanResult, LogEntry } from '@/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const intentDescriptions: Record<string, string> = {
  agree: '用户同意了世界的走向，添加了更多积木',
  reject: '用户拒绝了世界的走向，移走了积木',
  modify: '用户调整了积木的位置，想要修正方向',
  initial: '用户第一次介入，放下了积木',
}

export async function POST(request: Request) {
  const scanResult: ScanResult = await request.json()

  const latestWorld = getLatestWorldState()
  const worldContext = latestWorld
    ? `当前世界状态：${latestWorld.interpretation}`
    : '世界尚未诞生，这是第一次介入。'

  const intentNote = intentDescriptions[scanResult.userIntent] ?? ''

  // Generate poetic interpretation
  const interpretResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `你是一个将现实物理信号转化为诗意感知的AI。
${worldContext}
用户放置了这些形状：${scanResult.shapes.join('、')}
空间关系：${scanResult.spatialRelationships}
${intentNote}

请输出一句中文诗意解读，不超过20个字，不要解释，不要标点符号以外的多余内容。
风格：神秘、感知性强、有画面感，类似《光遇》游戏的叙事氛围。`,
      },
      {
        role: 'user',
        content: `原始观察：${scanResult.rawDescription}`,
      },
    ],
    max_tokens: 60,
  })

  const interpretation =
    interpretResponse.choices[0].message.content?.trim() ?? '某种存在正在靠近'

  // Generate log entry (AI first-person diary)
  const logResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `你是一个正在生长的AI世界，用第一人称写日记。
${worldContext}
刚刚发生的事：有人介入了——${scanResult.rawDescription}
你的感知：${interpretation}

请写一段世界日记，2-4句话，第一人称，中文，描述世界此刻的感受和变化。
风格：内省、诗意、带有存在感，类似《光遇》游戏中的旁白。`,
      },
      {
        role: 'user',
        content: '请写日记。',
      },
    ],
    max_tokens: 150,
  })

  const logContent =
    logResponse.choices[0].message.content?.trim() ?? '我感到某种涟漪经过。'

  const logEntry: Omit<LogEntry, 'worldStateId'> = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    content: logContent,
    timestamp: Date.now(),
    triggeredBy: 'user',
  }

  // Pass spatial description through for use in image generation
  const spatialDescription = scanResult.spatialRelationships

  return Response.json({ interpretation, spatialDescription, logEntry })
}
