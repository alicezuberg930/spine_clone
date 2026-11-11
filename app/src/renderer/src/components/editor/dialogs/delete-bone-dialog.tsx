import { GitBranch, Trash2 } from 'lucide-react'

import type { BoneDeletionMode } from '@/@types'
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

interface DeleteBoneDialogProps {
  open: boolean
  boneName: string
  childCount: number
  descendantCount: number
  onOpenChange: (open: boolean) => void
  onDelete: (mode: BoneDeletionMode) => void
}

export function DeleteBoneDialog({
  open,
  boneName,
  childCount,
  descendantCount,
  onOpenChange,
  onDelete
}: DeleteBoneDialogProps): React.JSX.Element {
  const hasChildren = childCount > 0
  const branchSize = descendantCount + 1

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border border-border/80 bg-popover/95 shadow-2xl backdrop-blur-xl sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete “{boneName}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasChildren
              ? `This bone has ${childCount} direct ${childCount === 1 ? 'child' : 'children'}. Choose what should happen to its child branch.`
              : 'This bone has no children and can be removed safely.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hasChildren ? (
          <div className="grid gap-2 text-xs">
            <div className="rounded-lg border border-border/75 bg-muted/25 p-3">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <GitBranch className="size-4 text-primary" /> Reparent children
              </div>
              <p className="mt-1.5 leading-5 text-muted-foreground">
                Remove only “{boneName}” and attach its direct children to the deleted bone’s parent
                while preserving their visible positions.
              </p>
            </div>
            <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <Trash2 className="size-4" /> Delete whole branch
              </div>
              <p className="mt-1.5 leading-5 text-muted-foreground">
                Remove {branchSize} {branchSize === 1 ? 'bone' : 'bones'}: “{boneName}” and all of
                its descendants.
              </p>
            </div>
          </div>
        ) : null}

        <AlertDialogFooter className="flex-wrap">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {hasChildren ? (
            <AlertDialogAction variant="outline" onClick={() => onDelete('reparent')}>
              <GitBranch /> Reparent children
            </AlertDialogAction>
          ) : null}
          <AlertDialogAction variant="destructive" onClick={() => onDelete('branch')}>
            <Trash2 /> {hasChildren ? 'Delete branch' : 'Delete bone'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
