'use server'

import { getSessionId, withSessionCookie } from '@/lib/session'
import { getAllLogs } from '@/lib/store'

export async function GET(request: Request) {
  const { sessionId, setCookie, cookieHeader } = getSessionId(request)
  return withSessionCookie({ logs: getAllLogs(sessionId) }, 200, setCookie ? cookieHeader : '')
}