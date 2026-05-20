'use server'

import { getSessionId, withSessionCookie } from '@/lib/session'
import { resetSession } from '@/lib/store'

export async function POST(request: Request) {
  const { sessionId, setCookie, cookieHeader } = getSessionId(request)
  resetSession(sessionId)
  return withSessionCookie({ ok: true }, 200, setCookie ? cookieHeader : '')
}