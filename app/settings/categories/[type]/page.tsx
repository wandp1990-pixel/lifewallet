import { notFound } from 'next/navigation'
import CategoriesView from '@/components/settings/CategoriesView'

export default async function CategoriesByTypePage({
  params,
}: {
  params: Promise<{ type: string }>
}) {
  const { type } = await params
  if (type !== 'income' && type !== 'expense' && type !== 'asset') notFound()

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <CategoriesView type={type} />
    </div>
  )
}
