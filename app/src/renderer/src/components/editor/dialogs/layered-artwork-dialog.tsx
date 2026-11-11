import { useId, useState, type DragEvent, type FormEvent } from 'react'
import { CircleAlert, FileImage, Layers3, Trash2, Upload } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

export interface LayeredArtworkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (files: File[]) => Promise<void>
}

const PSD_EXTENSION = '.psd'
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const ACCEPTED_FILES = '.psd,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp'

function fileExtension(file: File): string {
  const dotIndex = file.name.lastIndexOf('.')
  return dotIndex >= 0 ? file.name.slice(dotIndex).toLowerCase() : ''
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function validateFiles(files: File[]): string | null {
  if (files.length === 0) return 'Choose a PSD file or one or more supported image files.'

  const emptyFile = files.find((file) => file.size === 0)
  if (emptyFile) return `${emptyFile.name} is empty and cannot be imported.`

  const unsupportedFile = files.find((file) => {
    const extension = fileExtension(file)
    return extension !== PSD_EXTENSION && !IMAGE_EXTENSIONS.has(extension)
  })
  if (unsupportedFile) {
    return `${unsupportedFile.name} is not supported. Choose PSD, PNG, JPG, JPEG, or WebP files.`
  }

  const psdFiles = files.filter((file) => fileExtension(file) === PSD_EXTENSION)
  if (psdFiles.length > 0 && (psdFiles.length !== 1 || files.length !== 1)) {
    return 'Choose exactly one PSD file, or choose one or more image files without a PSD.'
  }

  return null
}

function importErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return 'The artwork could not be imported. Check the selected files and try again.'
}

export function LayeredArtworkDialog({
  open,
  onOpenChange,
  onImport
}: LayeredArtworkDialogProps): React.JSX.Element {
  const inputId = useId()
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const isPsd = files.length === 1 && fileExtension(files[0]) === PSD_EXTENSION
  const totalBytes = files.reduce((total, file) => total + file.size, 0)

  function reset(): void {
    setFiles([])
    setError(null)
    setIsDragging(false)
    setIsImporting(false)
  }

  function handleOpenChange(nextOpen: boolean): void {
    if (isImporting) return
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  function selectFiles(nextFiles: File[]): void {
    const validationError = validateFiles(nextFiles)
    setFiles(validationError ? [] : nextFiles)
    setError(validationError)
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault()
    setIsDragging(false)
    if (isImporting) return
    selectFiles(Array.from(event.dataTransfer.files))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const validationError = validateFiles(files)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setIsImporting(true)
    try {
      await onImport(files)
      reset()
      onOpenChange(false)
    } catch (importError) {
      setError(importErrorMessage(importError))
      setIsImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isImporting}
        className="overflow-hidden border border-border/80 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl sm:max-w-xl"
        aria-busy={isImporting}
      >
        <div className="border-b border-border/70 bg-gradient-to-r from-primary/10 to-transparent px-6 py-5">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base font-semibold">
              Import layered artwork
            </DialogTitle>
            <DialogDescription className="mt-1">
              Import one PSD or stack multiple image files as layers.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 px-6 pb-5">
          <label
            htmlFor={inputId}
            onDragEnter={(event) => {
              event.preventDefault()
              if (!isImporting) setIsDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setIsDragging(false)
              }
            }}
            onDrop={handleDrop}
            className={cn(
              'group grid min-h-36 place-items-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-6 text-center transition-colors',
              !isImporting && 'cursor-pointer hover:border-primary/50 hover:bg-primary/5',
              isDragging && 'border-primary bg-primary/8',
              isImporting && 'cursor-not-allowed opacity-65'
            )}
          >
            <div className="flex flex-col items-center gap-1">
              {isImporting ? (
                <Spinner className="mx-auto mb-3 size-7 text-primary" />
              ) : (
                <Upload className="mx-auto mb-3 size-7 text-muted-foreground transition-colors group-hover:text-primary" />
              )}
              <p className="text-sm font-medium">
                {isImporting ? 'Reading artwork layers…' : 'Drop artwork here or choose files'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                One PSD, or multiple PNG, JPG, JPEG, and WebP files
              </p>
            </div>
            <Input
              id={inputId}
              type="file"
              accept={ACCEPTED_FILES}
              multiple
              disabled={isImporting}
              aria-label="Choose layered artwork files"
              className="sr-only"
              onChange={(event) => {
                selectFiles(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
          </label>

          {files.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border/70 bg-background/25">
              <div className="flex items-center gap-3 border-b border-border/70 px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium">
                    {isPsd
                      ? 'PSD document selected'
                      : `${files.length} image layer${files.length === 1 ? '' : 's'} selected`}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {formatBytes(totalBytes)} total
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="ml-auto"
                  aria-label="Clear selected files"
                  disabled={isImporting}
                  onClick={() => {
                    setFiles([])
                    setError(null)
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
              <ScrollArea className="max-h-32">
                <ul className="divide-y divide-border/60" aria-label="Selected artwork files">
                  {files.map((file, index) => {
                    const Icon = fileExtension(file) === PSD_EXTENSION ? Layers3 : FileImage
                    return (
                      <li
                        key={`${file.name}-${file.lastModified}-${index}`}
                        className="flex items-center gap-2.5 px-3 py-2"
                      >
                        <Icon className="size-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate text-xs">{file.name}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatBytes(file.size)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </ScrollArea>
            </div>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Import failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter className="-mx-6 -mb-5 border-t border-border/70 bg-muted/20 px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              disabled={isImporting}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={files.length === 0 || isImporting}>
              {isImporting && <Spinner data-icon="inline-start" />}
              {isImporting ? 'Importing…' : 'Import artwork'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
