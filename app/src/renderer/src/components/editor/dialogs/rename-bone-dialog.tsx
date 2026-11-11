import { useEffect, useId, useRef, type FormEvent } from 'react'
import { Bone, PencilLine } from 'lucide-react'

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

interface RenameBoneDialogProps {
  open: boolean
  boneName: string
  error?: string | null
  onOpenChange: (open: boolean) => void
  onRename: (name: string) => void
}

export function RenameBoneDialog({
  open,
  boneName,
  error,
  onOpenChange,
  onRename
}: RenameBoneDialogProps): React.JSX.Element {
  const inputId = useId()
  const descriptionId = `${inputId}-description`
  const errorId = `${inputId}-error`
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [boneName, open])

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    onRename(inputRef.current?.value.trim() ?? '')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border border-border/80 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl sm:max-w-md">
        <div className="border-b border-border/70 bg-gradient-to-r from-primary/10 to-transparent px-6 py-5">
          <DialogHeader className="text-left">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Bone className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">Rename bone</DialogTitle>
                <DialogDescription id={descriptionId} className="mt-1">
                  Choose a clear name for this bone in the project hierarchy.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-5 px-6 py-5">
          <div className="grid gap-2">
            <Label htmlFor={inputId}>Bone name</Label>
            <Input
              key={`${boneName}:${open ? 'open' : 'closed'}`}
              ref={inputRef}
              id={inputId}
              defaultValue={boneName}
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
              <PencilLine data-icon="inline-start" />
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
