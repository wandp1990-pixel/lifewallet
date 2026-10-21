import { NextRequest, NextResponse } from 'next/server'

// A cookie presence check is only navigation assistance. Every data API validates
// the session in ownerApi; a forged/expired cookie grants no data access.
export function proxy(request: NextRequest) {
  const cookie =
    request.cookies.get('lifewallet-work.session_token') ??
    request.cookies.get('__Secure-lifewallet-work.session_token')
  return cookie ? NextResponse.next() : NextResponse.redirect(new URL('/login', request.url))
}
export const config = {
  matcher: [
    '/((?!api|login|mcp-connect|.well-known|_next|favicon.ico|manifest|sw.js|icons|images|.*\\.(?:png|svg|jpg|jpeg|webp|ico|woff2)).*)',
  ],
}
