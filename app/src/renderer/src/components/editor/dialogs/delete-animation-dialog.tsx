import { Film, Trash2 } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'

interface DeleteAnimationDialogProps {
  open: boolean
  animationName: string
  onOpenChange: (open: boolean) => void
  onDelete: () => void
}

export function DeleteAnimationDialog({
  open,
  animationName,
  onOpenChange,
  onDelete
}: DeleteAnimationDialogProps): React.JSX.Element {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border border-border/80 bg-popover/95 shadow-2xl backdrop-blur-xl sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete “{animationName}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Its timeline, tracks, and keyframes will be removed from this project. Other animations
            and the rig will not be changed.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-start gap-3 rounded-lg border border-border/75 bg-muted/25 p-3 text-xs text-muted-foreground">
          <Film className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>The next available animation will become active if this one is currently open.</p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDelete}>
            <Trash2 /> Delete animation
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
