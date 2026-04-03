export interface WorldState {
  id: string
  imageUrl: string
  interpretation: string
  timestamp: number
  triggeredBy: 'user' | 'ai'
}

export interface ScanResult {
  shapes: string[]
  spatialRelationships: string
  changeFromLast: 'added' | 'removed' | 'moved' | 'none'
  userIntent: 'agree' | 'reject' | 'modify' | 'initial'
  rawDescription: string
}

export interface LogEntry {
  id: string
  content: string
  timestamp: number
  triggeredBy: 'user' | 'ai'
  worldStateId: string
}
