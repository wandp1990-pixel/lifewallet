// 완제(잔액 0)된 대출을 표시하는 공용 배지. 대출이 표시되는 모든 화면에서 재사용한다.
// 긍정 상태이므로 수입(초록) 톤을 쓴다. 라이트·다크 모두 대응.
export default function PaidOffBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`shrink-0 rounded-full bg-[var(--color-income-subtle)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-income-strong)] ${className}`}
    >
      완제
    </span>
  )
}
