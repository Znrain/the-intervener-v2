import { randomUUID } from 'crypto'

const SESSION_COOKIE = 'intervener_sid'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export function getSessionId(request: Request): { sessionId: string; setCookie: boolean; cookieHeader: string } {
  const cookies = request.headers.get('cookie') ?? ''
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`))
  if (match && match[1]) {
    return { sessionId: match[1], setCookie: false, cookieHeader: '' }
  }
  const newId = randomUUID()
  const cookieStr = `${SESSION_COOKIE}=${newId}; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax`
  return { sessionId: newId, setCookie: true, cookieHeader: cookieStr }
}

/**
 * Wrap a Response with Set-Cookie header if needed.
 */
export function withSessionCookie(
  data: unknown,
  status: number,
  cookieHeader: string
): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (cookieHeader) {
    headers.set('Set-Cookie', cookieHeader)
  }
  return new Response(JSON.stringify(data), { status, headers })
}