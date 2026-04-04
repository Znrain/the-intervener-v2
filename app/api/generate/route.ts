import OpenAI from 'openai'
import { addWorldState, addLog } from '@/lib/store'
import type { WorldState, LogEntry } from '@/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const STYLE_SUFFIX =
`Flat illustration with subtle paper texture and soft grain. Layered depth: distant mountains/hills fade into misty background, mid-ground has rolling terrain or gentle landscape forms, foreground has darker silhouetted elements. Color palette: muted earthy tones — sage greens, dusty blues, warm terracotta, soft peach, golden amber, deep indigo. Soft atmospheric haze between layers. No photorealism, no heavy outlines. Painterly brushwork feel with visible texture, like hand-painted gouache on textured paper. Gentle glowing light from behind or above, warm ambient mood. Nature-inspired: hills, valleys, water, sky, wind, light. Contemplative and poetic atmosphere. Wide 16:9 landscape composition filling the entire frame. No text, no letters, no borders, no frames, no tarot/mandala patterns.`

export async function POST(request: Request) {
  try {
    const {
      interpretation,
      spatialDescription,
      logEntry,
      triggeredBy = 'user',
      userIntent,
      previousInterpretation,
      spatialDetail,
    }: {
      interpretation: string
      spatialDescription?: string
      logEntry: Omit<LogEntry, 'worldStateId'>
      triggeredBy: 'user' | 'ai'
      userIntent?: 'agree' | 'reject' | 'modify' | 'initial'
      previousInterpretation?: string
      spatialDetail?: string
    } = await request.json()

    // Build composition instruction from spatial detail (preferred) or spatial description
    let compositionInstruction = ''
    if (spatialDetail) {
      compositionInstruction = spatialDetail
    } else if (spatialDescription) {
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

    // Build intent-aware prompt based on user's physical feedback
    let intentPrefix = ''
    if (userIntent && previousInterpretation) {
      if (userIntent === 'agree') {
        intentPrefix = `Continuing the visual journey from "${previousInterpretation}", naturally evolving: `
      } else if (userIntent === 'reject') {
        intentPrefix = `Shifting away from "${previousInterpretation}", exploring a new direction: `
      } else if (userIntent === 'modify') {
        intentPrefix = `Building upon "${previousInterpretation}", refining the vision: `
      }
    }

    const basePrompt = compositionInstruction
      ? `${intentPrefix}${compositionInstruction}, ${interpretation}`
      : `${intentPrefix}${interpretation}`

    const prompt = `Wide cinematic landscape (16:9 aspect ratio, full frame composition): ${basePrompt}. ${STYLE_SUFFIX}`

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
