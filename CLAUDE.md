@AGENTS.md
# The Intervener / 介入者

## 项目概述
这是一个清华美术学院硕士毕业设计项目。一个由物理积木驱动、能够自主演化的AI生成世界系统。用户不需要写任何文字，只需要在桌上摆放形状，就能持续影响一个正在生长的AI世界。

## 核心交互机制：三步介入循环

### Step 1 — 物理扫描
用户把积木摆在桌上，网页摄像头拍照。
GPT-4o Vision识别：形状种类、数量、空间关系（哪个靠近哪个、朝向、聚散、大小对比）。
用户不需要知道积木代表什么，模糊性被完整保留。

### Step 2 — AI语义化解读
GPT-4o不直接生成图像，先输出一句诗意的话说出它理解到了什么。
例如："我看到了一片被遗忘的海岸，有什么东西正在靠近。"
同时显示自上次介入以来世界发生了什么变化。

### Step 3 — 物理表态（通过第二次扫描判断）
用户动完积木后再次拍照，系统对比两次扫描的差异：
- 积木数量增加 → 用户同意，继续这个方向
- 积木数量减少 → 用户拒绝，换个方向
- 数量不变但位置/朝向变了 → 用户修正
没有任何按钮，所有交互都是物理的。

## 世界自主演化
用户不在时，系统每隔一段时间自动推进世界一步。
用户回来时看到世界已经变化，并能看到变化的原因。

## 三个核心数据结构

### WorldState（世界状态）
```typescript
interface WorldState {
  id: string
  imageUrl: string        // DALL-E生成的世界画面
  interpretation: string  // GPT-4o的诗意解读
  timestamp: number
  triggeredBy: 'user' | 'ai'  // 因果可见性：谁触发了这次变化
}
```

### ScanResult（扫描结果）
```typescript
interface ScanResult {
  shapes: string[]           // 识别到的形状列表
  spatialRelationships: string  // 空间关系描述
  changeFromLast: 'added' | 'removed' | 'moved' | 'none'  // 与上次的差异
  userIntent: 'agree' | 'reject' | 'modify' | 'initial'   // 推断的用户意图
}
```

### LogEntry（世界日志）
```typescript
interface LogEntry {
  id: string
  content: string           // AI第一人称日记内容
  timestamp: number
  triggeredBy: 'user' | 'ai'
  worldStateId: string
}
```

## 技术栈
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- OpenAI API (GPT-4o Vision + GPT-4o + DALL-E 3)
- 数据存储：先用内存/JSON文件，后期可换数据库

## API Routes需要实现
- POST /api/scan — 接收图片，调用GPT-4o Vision识别，对比上次扫描，推断用户意图
- POST /api/interpret — 根据扫描结果调用GPT-4o生成诗意解读
- POST /api/generate — 调用DALL-E 3生成世界画面
- POST /api/evolve — AI自主推进世界（定时触发）
- GET /api/world — 获取当前世界状态
- GET /api/logs — 获取世界日志

## 视觉风格
光遇（Sky: Children of the Light）风格：
- 2D分层，有景深感（前景/中景/背景分层）
- 暗色调为主，有光晕效果
- 磨砂质感，柔和光线
- 版画感，非照片写实
DALL-E 3 prompt风格关键词：
"2D layered illustration, Sky game art style, dark atmospheric, soft glowing light, matte texture, painterly, silhouette layers, mystical fog, warm light accents, no text"

## 界面布局（网页端，非手机端）
三个区域：
1. 主视觉区：当前世界画面（占页面主体）
2. 世界日志区：AI第一人称日记，可滚动
3. 因果时间线：每次世界变化标注来源（用户介入 or AI自主演化）

## 摄像头功能
使用浏览器原生 getUserMedia API
网页上有一个摄像头预览窗口
用户点击"扫描"按钮触发拍照（注意：这个按钮只是触发拍照动作，不是用户表态，表态完全通过物理积木变化判断）

## 当前进度
项目刚初始化，从零开始构建。
优先跑通核心流程：拍照→Vision识别→诗意解读→生成画面→显示结果。
然后加入：对比扫描→推断用户意图→更新世界→写日志→因果时间线。
最后加入：定时自主演化。

## 重要设计原则
1. 没有文字输入框，用户不需要打任何字
2. 没有选择按钮用于表态，所有意图通过积木变化判断
3. 因果可见性是核心：每次世界变化必须标注是用户触发还是AI自主
4. 世界状态要持久化，用户离开再回来世界还在