'use client'
import { useRef } from 'react'

// Keep a request ID through network/5xx failures, but give a successful new
// user action a new ID even if its amount and description happen to match.
export function useLedgerRequest() {
  const pending = useRef(new Map<string, string>())
  return async function ledgerRequest(url: string, options: RequestInit = {}) {
    if (!options.method || options.method.toUpperCase() === 'GET') return fetch(url, options)
    const intent = JSON.stringify([url, options.method, options.body ?? null])
    let key = pending.current.get(intent)
    if (!key) {
      key = crypto.randomUUID()
      pending.current.set(intent, key)
    }
    const headers = new Headers(options.headers)
    headers.set('Idempotency-Key', key)
    const response = await fetch(url, { ...options, headers })
    if (response.status === 401 || response.status === 403) window.location.assign('/login')
    if (response.status < 500) {
      if (response.ok) await response.clone().json()
      pending.current.delete(intent)
    }
    return response
  }
}
