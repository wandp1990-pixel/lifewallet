import type { ReactNode } from 'react'
import {
  BookOpen, LayoutDashboard, BarChart2,
  Layers, PiggyBank, Star, Settings, FileText, MoreHorizontal,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: (active: boolean, variant: 'desktop' | 'mobile') => ReactNode
  matchMode?: 'exact' | 'startsWith'
}

const size = (variant: 'desktop' | 'mobile') => variant === 'desktop' ? 20 : 22

export const NAV_ITEMS = {
  daily: {
    href: '/',
    label: '가계부',
    matchMode: 'exact' as const,
    icon: (active: boolean, variant: 'desktop' | 'mobile') =>
      <BookOpen size={size(variant)} strokeWidth={active ? 2.5 : 1.8} />,
  },
  dashboard: {
    href: '/dashboard',
    label: '대시보드',
    icon: (active: boolean, variant: 'desktop' | 'mobile') =>
      <LayoutDashboard size={size(variant)} strokeWidth={active ? 2.5 : 1.8} />,
  },
  statistics: {
    href: '/statistics',
    label: '통계',
    icon: (active: boolean, variant: 'desktop' | 'mobile') =>
      <BarChart2 size={size(variant)} strokeWidth={active ? 2.5 : 1.8} />,
  },
  report: {
    href: '/report',
    label: '재무 보고서',
    icon: (active: boolean, variant: 'desktop' | 'mobile') =>
      <FileText size={size(variant)} strokeWidth={active ? 2.5 : 1.8} />,
  },
  assets: {
    href: '/assets',
    label: '자산',
    icon: (active: boolean, variant: 'desktop' | 'mobile') =>
      <Layers size={size(variant)} strokeWidth={active ? 2.5 : 1.8} />,
  },
  savings: {
    href: '/savings',
    label: '저축 목표',
    icon: (active: boolean, variant: 'desktop' | 'mobile') =>
      <PiggyBank size={size(variant)} strokeWidth={active ? 2.5 : 1.8} />,
  },
  wishlist: {
    href: '/wishlist',
    label: '위시리스트',
    icon: (active: boolean, variant: 'desktop' | 'mobile') =>
      <Star size={size(variant)} strokeWidth={active ? 2.5 : 1.8} />,
  },
  settings: {
    href: '/settings',
    label: '설정',
    icon: (active: boolean, variant: 'desktop' | 'mobile') =>
      variant === 'mobile'
        ? <MoreHorizontal size={size(variant)} strokeWidth={active ? 2.5 : 1.8} />
        : <Settings size={size(variant)} strokeWidth={active ? 2.5 : 1.8} />,
  },
} as Record<string, NavItem>

export type NavId = keyof typeof NAV_ITEMS

export const DESKTOP_NAV: { group: string; items: NavId[] }[] = [
  { group: '메인', items: ['daily', 'dashboard'] },
  { group: '분석', items: ['statistics', 'report'] },
  { group: '자산·계획', items: ['assets', 'savings', 'wishlist'] },
  { group: '시스템', items: ['settings'] },
]

export const MOBILE_NAV: NavId[] = ['daily', 'statistics', 'assets', 'settings']
