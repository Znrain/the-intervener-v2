import OpenAI from 'openai'
import { addWorldState, addLog } from '@/lib/store'
import type { WorldState, LogEntry } from '@/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const STYLE_SUFFIX =
  '2D layered paper cut illustration, visible depth between layers with drop shadows, grainy film texture overlay, rough edges, screen printing aesthetic, coarse grain noise, visible layer separation with dark shadow gaps between foreground midground and background, hand-crafted feel, NOT smooth NOT glossy NOT photorealistic, dark moody palette, warm amber light source, silhouette foreground layer, atmospheric haze in background, imperfect textures, risograph printing style, no text, no letters'

export async function POST(request: Request) {
  try {
    const {
      interpretation,
      spatialDescription,
      logEntry,
      triggeredBy = 'user',
    }: {
      interpretation: string
      spatialDescription?: string
      logEntry: Omit<LogEntry, 'worldStateId'>
      triggeredBy: 'user' | 'ai'
    } = await request.json()

    // Convert spatial description to an English composition instruction for DALL-E
    let compositionInstruction = ''
    if (spatialDescription) {
      const compRes = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a visual composition translator for an image generation system.
Convert the following Chinese spatial description of physical shapes into a concise English DALL-E composition instruction.
Focus on: placement (center/left/right/top/bottom), relative scale, proximity, arrangement pattern.
Output one English sentence only, no explanation.
Example output: "a tall form centered, an arc shape beneath it, small scattered elements in the periphery"`,
          },
          {
            role: 'user',
            content: spatialDescription,
          },
        ],
        max_tokens: 80,
      })
      compositionInstruction =
        compRes.choices[0].message.content?.trim() ?? ''
    }

    const prompt = compositionInstruction
      ? `${compositionInstruction}, ${interpretation}, ${STYLE_SUFFIX}`
      : `${interpretation}, ${STYLE_SUFFIX}`

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
      triggeredBy,
    }

    const fullLogEntry: LogEntry = {
      ...logEntry,
      worldStateId: worldState.id,
      triggeredBy,
    }

    addWorldState(worldState)
    addLog(fullLogEntry)

    return Response.json({ worldState, logEntry: fullLogEntry })
  } catch (err) {
    console.error('[generate]', err)
    return Response.json(
      { error: err instanceof Error ? err.message : '生成失败' },
      { status: 500 }
    )
  }
}
