@AGENTS.md
# The Intervener v2 / 介入者·重构版

## 项目概述
清华美术学院硕士毕业设计项目。在v1基础上进行完整的视觉与体验重设计。
核心交互机制不变，重构目标是将系统从功能性工具升级为一个有完整叙事弧线的沉浸式设计作品。

## 本版本新增的三个体验节点

### 节点一：入口页（新增）
路由：/enter 或 / （主页重定向）
- 全屏黑色/极深底色
- 中央显示当前世界状态图（若无世界则显示星云粒子动效）
- 一行文字：「这个世界正在等待你的介入」
- 触发点：一个光晕圆圈，用户点击/触碰后以fade+缩放过渡进入主界面
- 过渡动效：光晕扩散至全屏，dissolve进入主界面

### 节点二：主界面重设计（重构现有界面）
路由：/world
视觉方向：光遇（Sky）+ 2.5D层次感 + 古风典籍
具体要求：
- 背景：极深色（#0a0a0f），不是米白色
- 世界画面：不是方块图，是漂浮在空间中的发光平面，四周有光晕渐变边缘
- 时间线和日志：半透明悬浮卡片，毛玻璃效果，字体用暖金色或冷银色发光
- 扫描触发：点击扫描区域时有光波向外扩散涟漪动效
- AI自主演化时：画面边缘有缓慢流动的光粒子，提示世界在自主呼吸
- 摄像头预览：小窗，圆角，半透明边框，不显眼但始终可见
- 整体感：安静、克制、有重量感，不是游戏热闹感

### 节点三：收尾日志页（新增）
路由：/journal
触发：用户在主界面点击「结束本次介入」或会话超时后可进入
- 样式：全屏古籍/典籍风格，深色纸张质感背景
- 内容：按时间顺序翻页，每页一个时间节点
  - 用户介入页：显示当时的积木扫描图 + AI解读句 + 生成画面缩略图
  - AI演化页：显示演化前后画面对比 + 世界日志原文
- 翻页动效：慢速，带纸张纹理的page-turn效果
- 最后一页：完整世界线全貌，用户介入点（暖色）和AI演化点（冷色）交替排列在时间轴上
- 可导出/截图分享

## 核心交互机制（与v1完全相同，不改动）

### Step 1 — 物理扫描
用户把积木摆在桌上，网页摄像头拍照。
GPT-4o Vision识别：形状种类、数量、空间关系。
模糊性被完整保留。

### Step 2 — AI语义化解读
GPT-4o先输出一句诗意的话说出它理解到了什么。
同时显示自上次介入以来世界发生了什么变化。

### Step 3 — 物理表态（通过第二次扫描判断）
对比两次扫描差异：
- 积木数量增加 → 同意，继续这个方向
- 积木数量减少 → 拒绝，换个方向
- 数量不变但位置/朝向变了 → 修正

## 世界自主演化（与v1相同）
用户不在时系统自动推进世界。
用户回来时看到变化并能看到变化原因。

## 数据结构（与v1相同）

```typescript
interface WorldState {
  id: string
  imageUrl: string
  interpretation: string
  timestamp: number
  triggeredBy: 'user' | 'ai'
  scanImageUrl?: string  // 新增：保存当次扫描图，供日志页使用
}

interface ScanResult {
  shapes: string[]
  spatialRelationships: string
  changeFromLast: 'added' | 'removed' | 'moved' | 'none'
  userIntent: 'agree' | 'reject' | 'modify' | 'initial'
}

interface LogEntry {
  id: string
  content: string
  timestamp: number
  triggeredBy: 'user' | 'ai'
  worldStateId: string
}
```

## 技术栈
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Framer Motion（动效，新增）
- OpenAI API (GPT-4o Vision + GPT-4o + DALL-E 3)
- 数据存储：内存/JSON文件

## 路由结构
- / → 重定向到 /enter
- /enter → 入口页
- /world → 主界面（原有功能完整保留，视觉重构）
- /journal → 收尾日志页

## API Routes（与v1相同，无需改动）
- POST /api/scan
- POST /api/interpret
- POST /api/generate
- POST /api/evolve
- GET /api/world
- GET /api/logs

## 视觉设计规范

### 色彩系统
- 主背景：#0a0a0f（极深蓝黑）
- 次级背景：#12121a
- 世界画面光晕：rgba(255, 200, 120, 0.15) 暖金
- AI演化指示光：rgba(120, 160, 255, 0.2) 冷蓝
- 用户介入指示光：rgba(255, 180, 80, 0.3) 暖橙
- 文字主色：#e8dcc8（暖米白）
- 时间线暖色节点：#d4a853
- 时间线冷色节点：#7ab3d4
- 毛玻璃卡片：backdrop-blur-md, bg-white/5

### 字体
- 中文：系统默认或Noto Serif SC（典籍感）
- 数字/时间：等宽字体
- 诗意解读句：较大字号，字间距略宽

### 动效原则
- 所有过渡：easeInOut，不用弹簧动效
- 光晕扩散：0.8s-1.2s
- 页面切换：0.6s fade
- 翻页：1.0s，带轻微透视变形
- 粒子：极慢，5-10s一个循环

## 重要设计原则（与v1相同）
1. 没有文字输入框
2. 没有选择按钮用于表态，所有意图通过积木变化判断
3. 因果可见性是核心
4. 世界状态要持久化