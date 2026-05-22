interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`tds-skeleton ${className}`} />
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-9 h-9 rounded-[11px]" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonSummaryCard() {
  return (
    <div className="bg-[var(--color-surface)] rounded-2xl h-20 border border-[var(--color-border)] shadow-[0px_2px_10px_rgba(0,0,0,0.06)] flex flex-col px-[18px] justify-center gap-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3.5 w-12" />
      </div>
      <Skeleton className="h-[7px] w-full rounded-full" />
      <div className="flex justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  )
}
