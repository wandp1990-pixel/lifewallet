export const workScopes = ['openid', 'profile', 'email', 'offline_access', 'ledger:read', 'ledger:write']

export function isWorkOwner(email: unknown, verified: unknown): boolean {
  const allowed = process.env.WORK_MCP_ALLOWED_EMAIL?.trim().toLowerCase()
  return Boolean(allowed && verified === true && typeof email === 'string' && email.trim().toLowerCase() === allowed)
}

export function workAuthConfig() {
  const origin = process.env.WORK_MCP_ORIGIN
  const secret = process.env.WORK_AUTH_SECRET
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const owner = process.env.WORK_MCP_ALLOWED_EMAIL?.trim()
  if (!origin || !secret || secret.length < 32 || !clientId || !clientSecret || !owner || !process.env.TURSO_DATABASE_URL) return null
  try {
    const url = new URL(origin)
    const loopback = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.origin !== origin || (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))) return null
    return { origin, secret, clientId, clientSecret, resource: `${origin}/api/mcp` }
  } catch { return null }
}
