'use server'

import { getSessionId, withSessionCookie } from '@/lib/session'
import { getAllWorldStates, getAllLogs } from '@/lib/store'

export async function GET(request: Request) {
  const { sessionId, setCookie, cookieHeader } = getSessionId(request)
  const data = {
    worldStates: getAllWorldStates(sessionId),
    logs: getAllLogs(sessionId),
  }
  return withSessionCookie(data, 200, setCookie ? cookieHeader : '')
}