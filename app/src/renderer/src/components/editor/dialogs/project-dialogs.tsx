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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileArchive, FileImage, FileJson, FolderOpen, Plus } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'

export interface NewProjectValues {
  name: string
  width: number
  height: number
  fps: number
}

export interface NewProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (values: NewProjectValues) => void
  initialValues?: Partial<NewProjectValues>
}

export function NewProjectDialog({
  open,
  onOpenChange,
  onCreate,
  initialValues
}: NewProjectDialogProps): React.JSX.Element {
  const formId = useId()
  const [name, setName] = useState(initialValues?.name ?? 'Untitled rig')
  const [width, setWidth] = useState(initialValues?.width ?? 1920)
  const [height, setHeight] = useState(initialValues?.height ?? 1080)
  const [fps, setFps] = useState(initialValues?.fps ?? 30)

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    onCreate({ name: name.trim() || 'Untitled rig', width, height, fps })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border border-border/80 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl sm:max-w-lg">
        <div className="border-b border-border/70 bg-gradient-to-r from-primary/10 to-transparent px-6 py-5">
          <DialogHeader className="text-left">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Plus className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">Create a project</DialogTitle>
                <DialogDescription className="mt-1">
                  Set up a clean animation workspace.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <form id={formId} onSubmit={handleSubmit} className="grid gap-5 px-6 py-5">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-name`}>Project name</Label>
            <Input
              id={`${formId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor={`${formId}-width`}>Canvas width</Label>
              <Input
                id={`${formId}-width`}
                type="number"
                min={64}
                max={16384}
                value={width}
                onChange={(event) => setWidth(Number(event.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${formId}-height`}>Canvas height</Label>
              <Input
                id={`${formId}-height`}
                type="number"
                min={64}
                max={16384}
                value={height}
                onChange={(event) => setHeight(Number(event.target.value))}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${formId}-fps`}>Timeline frame rate</Label>
            <div className="flex items-center gap-3">
              <Input
                id={`${formId}-fps`}
                type="number"
                min={1}
                max={240}
                value={fps}
                onChange={(event) => setFps(Number(event.target.value))}
                className="w-28"
              />
              <span className="text-xs text-muted-foreground">frames per second</span>
            </div>
          </div>
        </form>

        <DialogFooter className="border-t border-border/70 bg-muted/20 px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId}>
            <Plus data-icon="inline-start" />
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export type ImportKind = 'project' | 'artwork' | 'data'

export interface ImportProjectValues {
  kind: ImportKind
  file: File
}

export interface ImportProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (values: ImportProjectValues) => void
}

const importAccept: Record<ImportKind, string> = {
  project: '.spine,.zip',
  artwork: '.psd,.png,.jpg,.jpeg,.webp',
  data: '.json,.skel,.bytes'
}

export function ImportProjectDialog({
  open,
  onOpenChange,
  onImport
}: ImportProjectDialogProps): React.JSX.Element {
  const inputId = useId()
  const [kind, setKind] = useState<ImportKind>('project')
  const [file, setFile] = useState<File | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!file) return
    onImport({ kind, file })
    onOpenChange(false)
    setFile(null)
  }

  function handleKindChange(value: string): void {
    setKind(value as ImportKind)
    setFile(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border border-border/80 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl sm:max-w-xl">
        <div className="border-b border-border/70 bg-gradient-to-r from-primary/10 to-transparent px-6 py-5">
          <DialogHeader className="text-left">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <FolderOpen className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">Import into workspace</DialogTitle>
                <DialogDescription className="mt-1">
                  Open a project, layered artwork, or compatible runtime data.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-5 px-6 py-5">
          <Tabs value={kind} onValueChange={handleKindChange}>
            <TabsList className="grid h-auto w-full grid-cols-3">
              <TabsTrigger value="project" className="h-9 text-xs">
                <FileArchive /> Project
              </TabsTrigger>
              <TabsTrigger value="artwork" className="h-9 text-xs">
                <FileImage /> Artwork
              </TabsTrigger>
              <TabsTrigger value="data" className="h-9 text-xs">
                <FileJson /> Data
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <label
            htmlFor={inputId}
            className="group grid min-h-40 cursor-pointer place-items-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-7 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
          >
            <div>
              <FolderOpen className="mx-auto mb-3 size-7 text-muted-foreground transition-colors group-hover:text-primary" />
              <p className="text-sm font-medium">{file ? file.name : 'Choose a file to import'}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {kind === 'project' && 'Spine project or packaged ZIP'}
                {kind === 'artwork' && 'Layered PSD or a supported image'}
                {kind === 'data' && 'Spine JSON or binary skeleton data'}
              </p>
            </div>
            <Input
              id={inputId}
              type="file"
              accept={importAccept[kind]}
              className="sr-only"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>

          <DialogFooter className="-mx-6 -mb-5 border-t border-border/70 bg-muted/20 px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!file}>
              <FolderOpen data-icon="inline-start" />
              Import file
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
