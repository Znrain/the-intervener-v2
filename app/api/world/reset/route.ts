'use server'

import { store } from '@/lib/store'

export async function POST() {
  store.worldStates = []
  store.logs = []
  store.lastScanResult = null
  return Response.json({ ok: true })
}
