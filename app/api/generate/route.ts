import OpenAI from 'openai'
import sharp from 'sharp'
import { addWorldState, addLog } from '@/lib/store'
import type { WorldState, LogEntry } from '@/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const TARGET_W = 1792
const TARGET_H = 1024
// Generate at 2x height, then crop center 16:9 — forces DALL-E to compose the full square
const GEN_SIZE = '1024x1024'

const STYLE_BLOCK = `STYLE:
Flat abstract editorial illustration. Smooth gradient shapes, flowing organic curves, clean vector style, minimal grain texture, soft muted color palette, calm and atmospheric. No shadows, no 3D, no material thickness, no layered depth, no photorealism, no heavy outlines, no glossy rendering, no ornate decorative borders, no tarot-card framing, no symmetrical poster layouts, no text, no letters.`

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

    // Build the intent hint
    const intentHint = buildIntentHint(userIntent, previousInterpretation)

    // Build the prompt with strict section separation
    const promptParts: string[] = []

    // 0. FRAME — full-frame composition constraint (top priority)
    promptParts.push(
      `[FRAME — COMPOSITION CONSTRAINT]
The image MUST be composed for a 16:9 aspect ratio and fill the entire frame.
Do NOT leave empty or flat background areas. Background must be part of the composition, not a blank fill.
Elements should extend toward edges to create a complete scene. Avoid centered isolated objects on empty background.
Design the scene as a full composition that fills the entire frame, not a single object on a blank background.
If the spatial structure describes only a few central elements, expand the scene by adding atmospheric surroundings — gradients, color fields, organic forms, mist, or subtle environmental texture — so the entire canvas is intentionally composed.`
    )

    // 1. STRUCTURE — hard constraint (dominant)
    if (compositionInstruction) {
      promptParts.push(
        `[STRUCTURE — LAYOUT IS MANDATORY]\n${compositionInstruction}\n\nThe layout MUST strictly follow the described spatial structure. Do not rearrange elements or reinterpret positions. Do not introduce new objects not described above. Do not ignore size ratios.`
      )
    }

    // 2. MOOD / ATMOSPHERE — soft influence (secondary)
    promptParts.push(
      `[MOOD / ATMOSPHERE]\n${interpretation}\n\nThis section only affects tone, feeling, and color atmosphere. It must NOT change layout, positions, or object relationships.`
    )

    // 3. USER INTENT — directional hint
    if (intentHint) {
      promptParts.push(`[USER INTENT]\n${intentHint}`)
    }

    // 4. STYLE — fixed system style
    promptParts.push(STYLE_BLOCK)

    const prompt = promptParts.join('\n\n---\n\n')

    console.log('[API/generate] DALL-E prompt:', prompt)
    console.log('[API/generate] Inputs:', { interpretation, spatialDetail, userIntent, previousInterpretation })

    // Generate at 1024x1024 (square) — DALL-E composes the full square
    const imageResponse = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: GEN_SIZE as '1024x1024',
      quality: 'standard',
    })

    const rawUrl = imageResponse.data?.[0]?.url ?? ''
    console.log('[API/generate] DALL-E raw URL:', rawUrl)

    if (!rawUrl) {
      throw new Error('DALL-E returned no image URL')
    }

    // Download the raw image
    const imageResp = await fetch(rawUrl)
    const imageBuffer = Buffer.from(await imageResp.arrayBuffer())

    // Crop center 16:9 from the 1024x1024 square, then resize to 1792x1024
    // Square 1024 → crop center 1024x576 (16:9) → resize to 1792x1024
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

    console.log('[API/generate] Cropped & resized to', TARGET_W, 'x', TARGET_H)

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
