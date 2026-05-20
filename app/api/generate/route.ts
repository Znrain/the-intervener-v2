'use server'

import OpenAI from 'openai'
import sharp from 'sharp'
import { getSessionId, withSessionCookie } from '@/lib/session'
import { addWorldState, addLog } from '@/lib/store'
import type { WorldState, LogEntry } from '@/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const TARGET_W = 1792
const TARGET_H = 1024
const GEN_SIZE = '1024x1024'

const STYLE_BLOCK = `STYLE:
Poetic narrative illustration, hand-painted flat shapes, organic natural forms, environmental scene composition, storybook-like illustration, soft grain texture, gouache or screenprint feel, slightly imperfect edges, atmospheric and lyrical, full-scene composition. Not geometric, not a centered symbolic poster, not polished vector design. No shadows, no 3D, no material thickness, no photorealism, no heavy outlines, no glossy rendering, no ornate decorative borders, no tarot-card framing, no symmetrical poster layouts, no text, no letters.

SHAPE TRANSLATION (CRITICAL):
Do NOT render geometric shapes as abstract forms. Interpret them as natural or environmental elements:
- circle → moon, sun, fruit, tree canopy, light source, opening in foliage
- arc → flowing water, hills, branches, wind paths, river bends
- triangle → mountain peaks, rooftops, tents, rock formations, tree tops
- crescent → moon phases, curved shoreline, bent branch
- rectangle → buildings, doorways, stones, book, path segments
- dots → stars, seeds, particles, leaves, dust, fireflies, distant birds
- line → horizon, path, river, branch, ray of light
- cluster → grove, flock, constellation, gathering

The structure must be preserved, but expressed through organic, natural visual language. The result must feel like a poetic world, not geometric abstraction.`

function buildIntentHint(
  userIntent?: 'agree' | 'reject' | 'modify' | 'initial',
  previousInterpretation?: string
): string {
  if (!userIntent || userIntent === 'initial' || !previousInterpretation) return ''
  if (userIntent === 'agree') {
    return `The user has affirmed this direction. Continue and reinforce the current composition and mood.`
  }
  if (userIntent === 'reject') {
    return `The user has rejected the previous direction. Vary the compositional direction and mood, but still strictly respect the spatial structure described above.`
  }
  if (userIntent === 'modify') {
    return `The user has made a subtle adjustment. Keep the structure intact but introduce small compositional variations.`
  }
  return ''
}

export async function POST(request: Request) {
  try {
    const { sessionId, setCookie, cookieHeader } = getSessionId(request)

    const {
      interpretation,
      spatialDescription,
      logEntry,
      triggeredBy = 'user',
      userIntent,
      previousInterpretation,
      spatialDetail,
      scanImageUrl,
    }: {
      interpretation: string
      spatialDescription?: string
      logEntry: Omit<LogEntry, 'worldStateId'>
      triggeredBy: 'user' | 'ai'
      userIntent?: 'agree' | 'reject' | 'modify' | 'initial'
      previousInterpretation?: string
      spatialDetail?: string
      scanImageUrl?: string
    } = await request.json()

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

    const intentHint = buildIntentHint(userIntent, previousInterpretation)

    const promptParts: string[] = []

    promptParts.push(
      `[FRAME — COMPOSITION CONSTRAINT]
The image MUST be composed for a 16:9 aspect ratio and fill the entire frame.
Do NOT leave empty or flat background areas. Background must be part of the composition, not a blank fill.
Elements should extend toward edges to create a complete scene. Avoid centered isolated objects on empty background.
Design the scene as a full composition that fills the entire frame, not a single object on a blank background.
If the spatial structure describes only a few central elements, expand the scene by adding atmospheric surroundings — gradients, color fields, organic forms, mist, or subtle environmental texture — so the entire canvas is intentionally composed.`
    )

    if (compositionInstruction) {
      promptParts.push(
        `[STRUCTURE — LAYOUT IS MANDATORY]\n${compositionInstruction}\n\nThe layout MUST strictly follow the described spatial structure. Do not rearrange elements or reinterpret positions. Do not introduce new objects not described above. Do not ignore size ratios.`
      )
    }

    promptParts.push(
      `[MOOD / ATMOSPHERE]\n${interpretation}\n\nThis section only affects tone, feeling, and color atmosphere. It must NOT change layout, positions, or object relationships.`
    )

    if (intentHint) {
      promptParts.push(`[USER INTENT]\n${intentHint}`)
    }

    promptParts.push(STYLE_BLOCK)

    const prompt = promptParts.join('\n\n---\n\n')

    console.log('[API/generate] prompt:', prompt)

    const imageResponse = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: GEN_SIZE as '1024x1024',
      quality: 'high',
    })

    const rawUrl = imageResponse.data?.[0]?.url ?? ''
    const rawB64 = imageResponse.data?.[0]?.b64_json ?? ''
    const rawImageData = rawUrl || rawB64
    console.log('[API/generate] Image generated, hasUrl:', !!rawUrl, 'hasB64:', !!rawB64)

    if (!rawImageData) {
      throw new Error('Image generation returned no data')
    }

    let imageBuffer: Buffer
    if (rawUrl) {
      const imageResp = await fetch(rawUrl)
      imageBuffer = Buffer.from(await imageResp.arrayBuffer())
    } else {
      imageBuffer = Buffer.from(rawB64, 'base64')
    }

    const cropHeight = Math.round(1024 * (9 / 16))
    const cropTop = Math.round((1024 - cropHeight) / 2)

    const croppedBuffer = await sharp(imageBuffer)
      .extract({ left: 0, top: cropTop, width: 1024, height: cropHeight })
      .resize(TARGET_W, TARGET_H, { fit: 'fill' })
      .jpeg({ quality: 92 })
      .toBuffer()

    const croppedBase64 = croppedBuffer.toString('base64')
    const imageUrl = `data:image/jpeg;base64,${croppedBase64}`

    const worldState: WorldState = {
      id: `world_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      imageUrl,
      interpretation,
      timestamp: Date.now(),
      triggeredBy,
      scanImageUrl,
    }

    const fullLogEntry: LogEntry = {
      ...logEntry,
      worldStateId: worldState.id,
      triggeredBy,
    }

    addWorldState(sessionId, worldState)
    addLog(sessionId, fullLogEntry)

    return withSessionCookie({ worldState, logEntry: fullLogEntry }, 200, setCookie ? cookieHeader : '')
  } catch (err) {
    console.error('[generate]', err)
    return Response.json(
      { error: err instanceof Error ? err.message : '生成失败' },
      { status: 500 }
    )
  }
}