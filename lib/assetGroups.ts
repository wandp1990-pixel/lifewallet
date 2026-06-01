import type { AssetGroupType } from './types'

// 자산 그룹 표시 순서·라벨 단일 소스. 자산 목록 페이지·내역 추가 시트가 공유한다.
export const ASSET_GROUP_ORDER: AssetGroupType[] = [
  'cash', 'bank', 'card', 'check_card', 'prepaid_card',
  'savings', 'investment', 'minus_account', 'loan', 'insurance', 'other',
]

export const ASSET_GROUP_LABELS: Record<AssetGroupType, string> = {
  cash: '현금',
  bank: '은행',
  card: '카드',
  check_card: '체크카드',
  prepaid_card: '선불카드',
  savings: '저축',
  investment: '투자',
  minus_account: '마이너스통장',
  loan: '대출',
  insurance: '보험',
  other: '기타',
}

// 주어진 자산 배열을 그룹 순서대로 묶는다. 빈 그룹은 제외, 그룹 내부는 order 기준 정렬.
export function groupAssets<T extends { group_type: AssetGroupType; order: number }>(
  assets: T[],
): { type: AssetGroupType; label: string; items: T[] }[] {
  const map = new Map<AssetGroupType, T[]>()
  for (const a of assets) {
    if (!map.has(a.group_type)) map.set(a.group_type, [])
    map.get(a.group_type)!.push(a)
  }
  return ASSET_GROUP_ORDER
    .filter(g => map.has(g))
    .map(g => ({
      type: g,
      label: ASSET_GROUP_LABELS[g],
      items: map.get(g)!.sort((a, b) => a.order - b.order),
    }))
}
