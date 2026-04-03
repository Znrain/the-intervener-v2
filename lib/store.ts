import type { WorldState, ScanResult, LogEntry } from '@/types'

// In-memory store — persists across requests within a single server process
interface Store {
  worldStates: WorldState[]
  logs: LogEntry[]
  lastScanResult: ScanResult | null
}

// Use globalThis to survive Next.js hot-reload in development
const globalStore = globalThis as typeof globalThis & { __store?: Store }

if (!globalStore.__store) {
  globalStore.__store = {
    worldStates: [],
    logs: [],
    lastScanResult: null,
  }
}

export const store = globalStore.__store

export function getLatestWorldState(): WorldState | null {
  const states = store.worldStates
  return states.length > 0 ? states[states.length - 1] : null
}

export function addWorldState(state: WorldState) {
  store.worldStates.push(state)
}

export function addLog(entry: LogEntry) {
  store.logs.push(entry)
}

export function setLastScan(result: ScanResult) {
  store.lastScanResult = result
}

export function getLastScan(): ScanResult | null {
  return store.lastScanResult
}
