import { categoryColor } from '@/lib/colors'

interface Props {
  icon: string
  id: string
  size?: number
}

export default function CatIcon({ icon, id, size = 36 }: Props) {
  const hexColor = id ? categoryColor(id) : null
  const bg = hexColor && hexColor.startsWith('#') ? hexColor + '26' : 'var(--color-surface-sub)'
  const radius = Math.round(size * 0.3)
  const fontSize = Math.round(size * 0.55)

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: bg,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: fontSize,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {icon || '📦'}
    </span>
  )
}
