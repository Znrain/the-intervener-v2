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
