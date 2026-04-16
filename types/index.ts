export interface WorldState {
  id: string
  imageUrl: string
  interpretation: string
  timestamp: number
  triggeredBy: 'user' | 'ai'
  scanImageUrl?: string
}

export interface ShapeObject {
  type: string
  size: 'large' | 'medium' | 'small'
  position: string
}

export interface ScanResult {
  shapes: ShapeObject[]
  spatialRelationships: string
  spatialDetail?: string
  changeFromLast: 'added' | 'removed' | 'moved' | 'none'
  userIntent: 'agree' | 'reject' | 'modify' | 'initial'
  rawDescription: string
  changeDescription?: string  // Detailed description of what changed
}

export interface LogEntry {
  id: string
  content: string
  timestamp: number
  triggeredBy: 'user' | 'ai'
  worldStateId: string
}
