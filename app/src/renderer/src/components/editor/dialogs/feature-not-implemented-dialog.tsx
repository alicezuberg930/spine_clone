import { Construction } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

export interface FeatureNotImplementedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  feature?: string
}

export function FeatureNotImplementedDialog({
  open,
  onOpenChange,
  feature
}: FeatureNotImplementedDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border border-border/80 bg-popover/95 shadow-2xl backdrop-blur-xl sm:max-w-md">
        <DialogHeader className="gap-3 text-left">
          <div className="grid size-10 place-items-center rounded-xl border border-border bg-muted text-muted-foreground">
            <Construction className="size-5" />
          </div>
          <div>
            <DialogTitle>Feature not implemented</DialogTitle>
            <DialogDescription className="mt-2 leading-6">
              {feature ? `${feature} is not available yet.` : 'This feature is not available yet.'}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
