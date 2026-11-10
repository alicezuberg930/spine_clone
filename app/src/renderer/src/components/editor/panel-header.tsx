import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface PanelHeaderProps {
  title: string
  eyebrow?: string
  actions?: ReactNode
  className?: string
}

export function PanelHeader({ title, eyebrow, actions, className }: PanelHeaderProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex h-9 shrink-0 items-center justify-between border-b border-border/80 bg-[#121d24] px-3',
        className
      )}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/90">
          {title}
        </span>
        {eyebrow ? <span className="truncate text-[10px] text-muted-foreground">{eyebrow}</span> : null}
      </div>
      {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
    </div>
  )
}
