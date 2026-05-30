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

// 필수성(50/30/20) 도넛 색상. 카테고리 해시 색상과 달리 분류별 고정 — 단일 소스: DESIGN_SYSTEM.md "필수성 분류 색상".
export const ESSENTIALITY_COLOR: Record<'needs' | 'wants' | 'savings' | 'unexpected', string> = {
  needs: '#3182f6',      // blue — 필수
  wants: '#8b5cf6',      // violet — 원함
  savings: '#03b26c',    // green — 저축
  unexpected: '#fe9800', // orange — 기타
}

export function categoryColor(categoryId: string): string {
  if (!categoryId) return 'var(--color-text-sub)'
  let hash = 0
  for (let i = 0; i < categoryId.length; i++) {
    hash = (hash * 31 + categoryId.charCodeAt(i)) | 0
  }
  return CATEGORY_PALETTE[Math.abs(hash) % CATEGORY_PALETTE.length]
}
