import { useEffect, useId, useRef, type FormEvent } from 'react'
import { Film, PencilLine, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AnimationNameDialogProps {
  open: boolean
  mode: 'create' | 'rename'
  initialName: string
  error?: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string) => void
}

export function AnimationNameDialog({
  open,
  mode,
  initialName,
  error,
  onOpenChange,
  onSubmit
}: AnimationNameDialogProps): React.JSX.Element {
  const inputId = useId()
  const descriptionId = `${inputId}-description`
  const errorId = `${inputId}-error`
  const inputRef = useRef<HTMLInputElement | null>(null)
  const isCreating = mode === 'create'

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [initialName, open])

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    onSubmit(inputRef.current?.value.trim() ?? '')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border border-border/80 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl sm:max-w-md">
        <div className="border-b border-border/70 bg-gradient-to-r from-primary/10 to-transparent px-6 py-5">
          <DialogHeader className="text-left">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Film className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  {isCreating ? 'New animation' : 'Rename animation'}
                </DialogTitle>
                <DialogDescription id={descriptionId} className="mt-1">
                  {isCreating
                    ? 'Create an independent timeline for another character action.'
                    : 'Choose a clear name for this animation in the project tree.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-5 px-6 py-5">
          <div className="grid gap-2">
            <Label htmlFor={inputId}>Animation name</Label>
            <Input
              key={`${mode}:${initialName}:${open ? 'open' : 'closed'}`}
              ref={inputRef}
              id={inputId}
              defaultValue={initialName}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}
              autoComplete="off"
              autoFocus
            />
            {error ? (
              <p id={errorId} role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter className="-mx-6 -mb-5 border-t border-border/70 bg-muted/20 px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {isCreating ? (
                <Plus data-icon="inline-start" />
              ) : (
                <PencilLine data-icon="inline-start" />
              )}
              {isCreating ? 'Create animation' : 'Rename'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
