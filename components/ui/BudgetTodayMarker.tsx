interface BudgetTodayMarkerProps {
  dayPct: number
  clampedDayPct: number
  label?: boolean
}

export default function BudgetTodayMarker({ dayPct, clampedDayPct, label = false }: BudgetTodayMarkerProps) {
  if (!label) {
    return (
      <div
        aria-hidden="true"
        className="absolute inset-y-[-3px] z-10 w-px bg-[var(--color-primary)] opacity-[0.45]"
        style={{ left: `${dayPct}%`, transform: 'translateX(-50%)' }}
      />
    )
  }

  return (
    <>
      <div
        className="absolute top-0 z-20 flex flex-col items-center"
        style={{ left: `${clampedDayPct}%`, transform: 'translateX(-50%)' }}
      >
        <div className="rounded-sm border border-[var(--color-primary)] bg-[var(--color-primary-subtle)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--color-primary)] leading-none whitespace-nowrap">
          오늘
        </div>
        <div className="h-0 w-0 border-l-[3px] border-r-[3px] border-t-[4px] border-l-transparent border-r-transparent border-t-[var(--color-primary)]" />
      </div>
      <div
        aria-hidden="true"
        className="absolute bottom-[-5px] top-6 z-10 w-px bg-[var(--color-primary)] opacity-[0.45]"
        style={{ left: `${dayPct}%`, transform: 'translateX(-50%)' }}
      />
    </>
  )
}
