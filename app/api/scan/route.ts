import OpenAI from 'openai'
import { getLastScan, setLastScan } from '@/lib/store'
import type { ScanResult } from '@/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(request: Request) {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = await request.json()

    if (!imageBase64) {
      return Response.json({ error: '缺少图片数据' }, { status: 400 })
    }

    const lastScan = getLastScan()
    const isInitial = lastScan === null

    const systemPrompt = `你是一个观察积木的AI系统。用户将在桌面上摆放积木，你需要识别形状并推断用户意图。
请以JSON格式返回结果，包含以下字段：
- shapes: 识别到的形状列表（数组，每个元素是形状描述，例如"圆形"、"三角形"、"矩形"）
- spatialRelationships: 描述这些形状之间的空间关系（一句话，中文）
- shapeCount: 形状总数量（数字）
- rawDescription: 用一句话描述你看到的整体画面（中文）`

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
      max_tokens: 500,
    })

    const raw = JSON.parse(response.choices[0].message.content ?? '{}')
    const currentCount: number = raw.shapeCount ?? (raw.shapes?.length ?? 0)
    const lastCount = lastScan ? lastScan.shapes.length : 0

    let changeFromLast: ScanResult['changeFromLast'] = 'none'
    let userIntent: ScanResult['userIntent'] = 'initial'

    if (isInitial) {
      changeFromLast = 'none'
      userIntent = 'initial'
    } else if (currentCount > lastCount) {
      changeFromLast = 'added'
      userIntent = 'agree'
    } else if (currentCount < lastCount) {
      changeFromLast = 'removed'
      userIntent = 'reject'
    } else {
      const currentShapes = (raw.shapes as string[]) ?? []
      const lastShapes = lastScan!.shapes
      const sameShapes =
        currentShapes.length === lastShapes.length &&
        currentShapes.every((s, i) => s === lastShapes[i])
      changeFromLast = sameShapes ? 'none' : 'moved'
      userIntent = sameShapes ? 'agree' : 'modify'
    }

    const result: ScanResult = {
      shapes: (raw.shapes as string[]) ?? [],
      spatialRelationships: raw.spatialRelationships ?? '',
      changeFromLast,
      userIntent,
      rawDescription: raw.rawDescription ?? '',
    }

    setLastScan(result)
    return Response.json(result)
  } catch (err) {
    console.error('[scan]', err)
    return Response.json(
      { error: err instanceof Error ? err.message : '识别失败' },
      { status: 500 }
    )
  }
}
