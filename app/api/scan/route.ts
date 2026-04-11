import OpenAI from 'openai'
import { getLastScan, setLastScan } from '@/lib/store'
import type { ScanResult, ShapeObject } from '@/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(request: Request) {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = await request.json()
    console.log('[API/scan] Received request', { imageBase64Length: imageBase64?.length, mimeType })

    if (!imageBase64) {
      return Response.json({ error: '缺少图片数据' }, { status: 400 })
    }

    const lastScan = getLastScan()
    const isInitial = lastScan === null

    const systemPrompt = `You observe physical shapes (blocks, objects) placed on a flat surface and output a structured description suitable for image generation.

Analyze the image and return a JSON object with these exact fields:

1. shapes: Array of objects, each with:
   - type: geometric shape name (circle, triangle, arc, crescent, rectangle, line, dot, square, hexagon, etc.)
   - size: relative size as "large", "medium", or "small"
   - position: one of "top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"

2. spatialDetail: A clear English composition description. Rules:
   - Identify the dominant shapes and their approximate positions (top / center / bottom)
   - Describe key relationships: what is above, below, beside, or surrounding what
   - Note rough scale differences between elements (large vs small)
   - Mention the overall compositional flow (vertically stacked, horizontally spread, centered, asymmetric, etc.)
   - Keep it structured but natural — guide composition without over-specifying
   - Do NOT use percentages, exact measurements, or micro-level alignment details
   - Example: "A large circular form is placed near the upper center. Beneath it, layered curved bands extend across the lower half. Smaller circular and cloud-like elements are scattered around the central form. The composition is vertically centered with a dominant focal point."

3. spatialRelationships: A single Chinese sentence describing spatial relationships between objects (e.g., "圆形在三角形上方，两个矩形并排位于底部")

4. shapeCount: Total number of detected shapes (integer)

5. rawDescription: One factual Chinese sentence describing the overall layout (e.g., "一个大圆形在上方，下方有一个弧形，左下角有两个小三角形")

Rules:
- Be clear and structured, not poetic
- Use positional terms consistently
- Describe scale differences naturally (large, small, scattered)
- Do not interpret meaning, emotion, or intent
- Do not describe lighting, color, or artistic style`

    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
      {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${imageBase64}`,
          detail: 'low',
        },
      },
      {
        type: 'text',
        text: isInitial
          ? '请识别桌面上的积木形状、数量和空间关系。这是第一次扫描。'
          : `请识别桌面上的积木形状、数量和空间关系。上次识别到 ${lastScan.shapes.length} 个形状：${lastScan.shapes.join('、')}。`,
      },
    ]

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    })

    const raw = JSON.parse(response.choices[0].message.content ?? '{}')
    console.log('[API/scan] GPT-4o Vision raw response:', raw)
    const currentCount: number = raw.shapeCount ?? (raw.shapes?.length ?? 0)
    const lastCount = lastScan ? lastScan.shapes.length : 0

    // Extract shape type names for comparison
    const currentShapeNames: string[] = (raw.shapes as { type: string }[])?.map((s) => s.type) ?? []
    const lastShapeNames: string[] = lastScan?.shapes.map((s) => s.type) ?? []

    let changeFromLast: ScanResult['changeFromLast'] = 'none'
    let userIntent: ScanResult['userIntent'] = 'initial'
    let changeDescription = ''

    if (isInitial) {
      changeFromLast = 'none'
      userIntent = 'initial'
      changeDescription = ''
    } else {
      // Generate detailed change description using GPT-4o
      const changeAnalysisPrompt = `你是一个观察积木变化的AI。

上次扫描：${lastShapeNames.join('、')}
空间关系：${lastScan!.spatialRelationships}

这次扫描：${currentShapeNames.join('、')}
空间关系：${raw.spatialRelationships}

请用一句中文描述用户对积木做了什么具体改变，以及这可能暗示了什么意图。
格式：用户[具体动作]，这可能意味着[推断的意图]。
例如："用户把弯月形从三角形下方移开了，圆形向中心聚拢，这可能意味着想要收束聚焦。"
保持简洁，一句话，不超过40字。`

      const changeAnalysis = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: '你是一个敏锐的观察者，善于从物理变化中读出意图。' },
          { role: 'user', content: changeAnalysisPrompt },
        ],
        max_tokens: 100,
      })

      changeDescription = changeAnalysis.choices[0].message.content?.trim() ?? ''

      // Determine change type and intent
      if (currentCount > lastCount) {
        changeFromLast = 'added'
        userIntent = 'agree'
      } else if (currentCount < lastCount) {
        changeFromLast = 'removed'
        userIntent = 'reject'
      } else {
        const sameShapes =
          currentShapeNames.length === lastShapeNames.length &&
          currentShapeNames.every((s, i) => s === lastShapeNames[i])
        changeFromLast = sameShapes ? 'none' : 'moved'
        userIntent = sameShapes ? 'agree' : 'modify'
      }
    }

    const result: ScanResult = {
      shapes: (raw.shapes as ShapeObject[]) ?? [],
      spatialRelationships: raw.spatialRelationships ?? '',
      spatialDetail: raw.spatialDetail ?? '',
      changeFromLast,
      userIntent,
      rawDescription: raw.rawDescription ?? '',
      changeDescription,
    }

    setLastScan(result)
    console.log('[API/scan] Returning result:', result)
    return Response.json(result)
  } catch (err) {
    console.error('[scan]', err)
    return Response.json(
      { error: err instanceof Error ? err.message : '识别失败' },
      { status: 500 }
    )
  }
}
