'use client'

import { useId, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'

interface ActionMenuProps {
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  items: { label: string; onSelect: () => void; danger?: boolean }[]
}

export default function ActionMenu({ label, open, onOpenChange, items }: ActionMenuProps) {
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return

    const viewport = window.visualViewport
    const position = () => {
      const rect = trigger.getBoundingClientRect()
      const left = viewport?.offsetLeft ?? 0
      const top = viewport?.offsetTop ?? 0
      const width = viewport?.width ?? window.innerWidth
      const height = viewport?.height ?? window.innerHeight
      menu.style.maxHeight = `${Math.max(0, height - 16)}px`
      menu.style.maxWidth = `${Math.max(0, width - 16)}px`
      const size = menu.getBoundingClientRect()
      const below = rect.bottom + 4
      const y = below + size.height <= top + height - 8 ? below : rect.top - size.height - 4
      menu.style.left = `${Math.max(left + 8, Math.min(rect.right - size.width, left + width - size.width - 8))}px`
      menu.style.top = `${Math.max(top + 8, Math.min(y, top + height - size.height - 8))}px`
    }
    position()
    menu.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    window.addEventListener('resize', position)
    viewport?.addEventListener('resize', position)
    viewport?.addEventListener('scroll', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      viewport?.removeEventListener('resize', position)
      viewport?.removeEventListener('scroll', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open])

  function close() {
    onOpenChange(false)
    triggerRef.current?.focus({ preventScroll: true })
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-[var(--color-border)] transition-colors"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
      >
        <MoreHorizontal size={16} aria-hidden="true" className="text-[var(--color-text-sub)]" />
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[150]" onClick={close} aria-hidden="true" />
          <div
            ref={menuRef}
            id={id}
            role="menu"
            aria-label={label}
            className="fixed z-[151] min-w-[120px] overflow-y-auto overscroll-contain rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-e3)]"
            onKeyDown={event => {
              const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
              if (event.key === 'Escape' || event.key === 'Tab') {
                if (event.key === 'Escape') event.preventDefault()
                close()
              } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault()
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
                  : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
                buttons[next]?.focus()
              }
            }}
          >
            {items.map(item => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => { close(); item.onSelect() }}
                className={`block w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-[var(--color-surface-sub)] focus-visible:bg-[var(--color-surface-sub)] ${item.danger ? 'text-[var(--color-expense)]' : 'text-[var(--color-text)]'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  )
}
