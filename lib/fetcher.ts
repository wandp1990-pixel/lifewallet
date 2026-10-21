export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (res.status === 401 || res.status === 403) window.location.assign('/login')
  if (!res.ok) throw new Error(`fetch error: ${url}`)
  return res.json()
}
