import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Crown, LockKeyhole, Sparkles } from 'lucide-react'

export type TrialAction = 'save' | 'export' | 'texture-pack' | 'runtime' | string

export interface TrialNoticeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  action: TrialAction
}

const actionCopy: Record<string, { title: string; description: string }> = {
  save: {
    title: 'Saving is unavailable in Trial',
    description:
      'You can keep exploring every editor tool in this session, but Trial projects cannot be written to disk.'
  },
  export: {
    title: 'Export is unavailable in Trial',
    description: 'Data, images, video, and HTML output require a licensed edition of the editor.'
  },
  'texture-pack': {
    title: 'Texture packing is unavailable in Trial',
    description: 'Atlas and spritesheet generation is included with Essential and Professional.'
  },
  runtime: {
    title: 'Runtime shipping requires a license',
    description:
      'Trial is designed for evaluation. A paid editor license grants the rights needed to integrate Spine Runtimes into a product.'
  }
}

export function TrialNoticeDialog({
  open,
  onOpenChange,
  action
}: TrialNoticeDialogProps): React.JSX.Element {
  const copy = actionCopy[action] ?? {
    title: 'This action is unavailable in Trial',
    description:
      'Trial lets you evaluate the complete animation workflow, while durable output requires a licensed edition.'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border border-border/80 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl sm:max-w-lg">
        <div className="relative border-b border-border/70 bg-gradient-to-br from-primary/12 via-transparent to-amber-500/10 px-6 py-6">
          <div className="absolute -right-10 -top-12 size-32 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <LockKeyhole className="size-5" />
            </div>
            <DialogHeader className="gap-2 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-base font-semibold">{copy.title}</DialogTitle>
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-amber-300"
                >
                  Trial mode
                </Badge>
              </div>
              <DialogDescription className="max-w-md leading-6">
                {copy.description}
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-primary" />
              Continue evaluating
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Rig, animate, preview, import, and inspect every Trial-supported feature.
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              <Crown className="size-4 text-amber-400" />
              Unlock output
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Essential enables basic project output; Professional includes the complete toolset.
            </p>
          </div>
        </div>

        <DialogFooter className="border-t border-border/70 bg-muted/20 px-6 py-4 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep exploring
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            <Crown data-icon="inline-start" />
            Compare editions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
