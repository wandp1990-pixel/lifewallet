import { Suspense } from 'react'
import BudgetSettings from '@/components/statistics/BudgetSettings'

export default function BudgetSettingsPage() {
  return (
    <Suspense>
      <BudgetSettings />
    </Suspense>
  )
}
