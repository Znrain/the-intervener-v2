import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Common mobile device patterns in User-Agent
function isMobileDevice(userAgent: string): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only intercept top-level routes, not /m/... routes themselves
  const desktopRoutes = ['/enter', '/world', '/journal', '/']
  const isDesktopRoute = desktopRoutes.some(r => pathname === r || (r === '/' && pathname === '/'))

  if (!isDesktopRoute) return NextResponse.next()

  const userAgent = request.headers.get('user-agent') ?? ''
  const mobile = isMobileDevice(userAgent)

  // Mobile → redirect to /m/...
  if (mobile) {
    const url = request.nextUrl.clone()
    if (pathname === '/') {
      url.pathname = '/m/world'
    } else {
      url.pathname = `/m${pathname}`
    }
    return NextResponse.redirect(url)
  }

  // Desktop → continue
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
