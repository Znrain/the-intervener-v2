import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only intercept top-level routes
  const desktopRoutes = ['/enter', '/world', '/journal', '/']
  const isDesktopRoute = desktopRoutes.some(r => pathname === r || (r === '/' && pathname === '/'))

  if (!isDesktopRoute) return NextResponse.next()

  // Serve desktop UI to all devices (mobile users can rotate to landscape)
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
