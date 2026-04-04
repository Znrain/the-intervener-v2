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
- spatialDetail: 用英文描述每个形状在画面中的具体位置、大小和方向，作为图像生成的构图参考。例如："a tall triangle in the upper left, a small circle near the center, a crescent shape on the right side tilted 45 degrees, three rectangles clustered at the bottom"
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
    let changeDescription = ''

    if (isInitial) {
      changeFromLast = 'none'
      userIntent = 'initial'
      changeDescription = ''
    } else {
      // Generate detailed change description using GPT-4o
      const changeAnalysisPrompt = `你是一个观察积木变化的AI。

上次扫描：${lastScan!.shapes.join('、')}
空间关系：${lastScan!.spatialRelationships}

这次扫描：${(raw.shapes as string[]).join('、')}
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
        const currentShapes = (raw.shapes as string[]) ?? []
        const lastShapes = lastScan!.shapes
        const sameShapes =
          currentShapes.length === lastShapes.length &&
          currentShapes.every((s, i) => s === lastShapes[i])
        changeFromLast = sameShapes ? 'none' : 'moved'
        userIntent = sameShapes ? 'agree' : 'modify'
      }
    }

    const result: ScanResult = {
      shapes: (raw.shapes as string[]) ?? [],
      spatialRelationships: raw.spatialRelationships ?? '',
      spatialDetail: raw.spatialDetail ?? '',
      changeFromLast,
      userIntent,
      rawDescription: raw.rawDescription ?? '',
      changeDescription,
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
