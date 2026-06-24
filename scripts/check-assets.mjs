/**
 * Build-time asset gate (coding PITFALLS F14 — iOS apple-touch-icon).
 *
 * Runs as part of `build` (`node scripts/check-assets.mjs && next build`), so it
 * executes on every Vercel production build. A failure exits non-zero → the build
 * fails → the deploy is blocked. Tool-independent: enforces no matter who or what
 * triggers the deploy (any AI, any human, any CLI).
 *
 * This app wires the iOS icon via `public/apple-icon.png` + `metadata.icons.apple`
 * (not the app/ convention file), so the link only appears if BOTH the PNG file and
 * the layout wiring are present. The gate asserts both — a missing file OR a dropped
 * metadata.icons.apple line silently kills the iOS home-screen icon (F14).
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const errors = []

// 1) The iOS home-screen PNG must exist.
if (!existsSync(join(root, 'public', 'apple-icon.png'))) {
  errors.push('public/apple-icon.png missing — iOS home-screen icon. Without it iOS shows a gray letter fallback.')
}

// 2) layout must wire it (metadata.icons.apple), else <link rel="apple-touch-icon"> is never emitted.
const layout = ['app/layout.tsx', 'src/app/layout.tsx'].map((p) => join(root, p)).find(existsSync)
if (!layout) {
  errors.push('app/layout.tsx not found — cannot verify apple-touch-icon wiring.')
} else if (!readFileSync(layout, 'utf8').includes('apple-icon')) {
  errors.push("layout.tsx does not reference apple-icon — add metadata.icons.apple: '/apple-icon.png'.")
}

if (errors.length > 0) {
  console.error('\n✗ Build blocked — iOS icon requirements not met (coding PITFALLS F14):')
  for (const e of errors) console.error(`    - ${e}`)
  console.error('')
  process.exit(1)
}

// F19 — Vercel function region must be pinned. Default (iad1, US) is far from the
// Tokyo Turso DB, so every SSR DB round-trip crosses the Pacific (~170ms). vercel.json
// must declare a non-empty `regions` so the function co-locates near the DB/users.
const vercelJsonPath = join(root, 'vercel.json')
let regionError = null
if (!existsSync(vercelJsonPath)) {
  regionError = 'vercel.json missing — function defaults to iad1 (US), far from the Tokyo Turso DB.'
} else {
  try {
    const cfg = JSON.parse(readFileSync(vercelJsonPath, 'utf8'))
    if (!Array.isArray(cfg.regions) || cfg.regions.length === 0) {
      regionError = 'vercel.json has no non-empty "regions" — function defaults to iad1 (US).'
    }
  } catch {
    regionError = 'vercel.json is not valid JSON.'
  }
}
if (regionError) {
  console.error('\n✗ Build blocked — Vercel region not pinned (coding PITFALLS F19):')
  console.error(`    - ${regionError}`)
  console.error('\n  Fix: add vercel.json with { "regions": ["icn1"] } (Seoul, near the Tokyo Turso DB).\n')
  process.exit(1)
}

console.log('✓ asset + region check passed (public/apple-icon.png + layout wiring, vercel.json regions)')
