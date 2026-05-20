import type { WorldState, ScanResult, LogEntry } from '@/types'

// In-memory store — persists across requests within a single server process
interface Store {
  worldStates: WorldState[]
  logs: LogEntry[]
  lastScanResult: ScanResult | null
}

// Session store: Map<sessionId, Store>
interface GlobalStore {
  __sessionStore?: Map<string, Store>
}

// Use globalThis to survive Next.js hot-reload in development
const globalStore = globalThis as GlobalStore

function getSessionStore(): Map<string, Store> {
  if (!globalStore.__sessionStore) {
    globalStore.__sessionStore = new Map()
  }
  return globalStore.__sessionStore
}

function getOrCreateSessionStore(sessionId: string): Store {
  const sessionStore = getSessionStore()
  if (!sessionStore.has(sessionId)) {
    sessionStore.set(sessionId, {
      worldStates: [],
      logs: [],
      lastScanResult: null,
    })
  }
  return sessionStore.get(sessionId)!
}

export function getLatestWorldState(sessionId: string): WorldState | null {
  const store = getOrCreateSessionStore(sessionId)
  const states = store.worldStates
  return states.length > 0 ? states[states.length - 1] : null
}

export function addWorldState(sessionId: string, state: WorldState) {
  const store = getOrCreateSessionStore(sessionId)
  store.worldStates.push(state)
}

export function addLog(sessionId: string, entry: LogEntry) {
  const store = getOrCreateSessionStore(sessionId)
  store.logs.push(entry)
}

export function setLastScan(sessionId: string, result: ScanResult) {
  const store = getOrCreateSessionStore(sessionId)
  store.lastScanResult = result
}

export function getLastScan(sessionId: string): ScanResult | null {
  const store = getOrCreateSessionStore(sessionId)
  return store.lastScanResult
}

export function resetSession(sessionId: string) {
  const sessionStore = getSessionStore()
  sessionStore.set(sessionId, {
    worldStates: [],
    logs: [],
    lastScanResult: null,
  })
}

export function getAllWorldStates(sessionId: string): WorldState[] {
  const store = getOrCreateSessionStore(sessionId)
  return store.worldStates
}

export function getAllLogs(sessionId: string): LogEntry[] {
  const store = getOrCreateSessionStore(sessionId)
  return store.logs
}

// Legacy export — for backwards compatibility if needed, but all routes should use sessionId
export const store = {
  get worldStates() { return [] },
  get logs() { return [] },
  get lastScanResult() { return null },
}