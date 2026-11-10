import type { ComponentType } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface IconToolProps {
  icon: ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  className?: string
}

export function IconTool({
  icon: Icon,
  label,
  shortcut,
  active = false,
  disabled = false,
  onClick,
  className
}: IconToolProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            onClick={onClick}
            className={cn(
              'size-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
              active &&
                'bg-primary/14 text-primary ring-1 ring-primary/35 hover:bg-primary/18 hover:text-primary',
              className
            )}
          />
        }
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        <span>{label}</span>
        {shortcut ? (
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">{shortcut}</kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}
