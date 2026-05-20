const CATEGORY_PALETTE = [
  '#3182f6',
  '#03b26c',
  '#fe9800',
  '#f04452',
  '#8b5cf6',
  '#0ea5e9',
  '#14b8a6',
  '#f59e0b',
  '#ec4899',
  '#84cc16',
  '#6366f1',
  '#94a3b8',
]

export function categoryColor(categoryId: string): string {
  if (!categoryId) return 'var(--color-text-sub)'
  let hash = 0
  for (let i = 0; i < categoryId.length; i++) {
    hash = (hash * 31 + categoryId.charCodeAt(i)) | 0
  }
  return CATEGORY_PALETTE[Math.abs(hash) % CATEGORY_PALETTE.length]
}
