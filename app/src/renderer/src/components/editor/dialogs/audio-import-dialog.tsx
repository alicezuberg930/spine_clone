import { useId, useState, type DragEvent, type FormEvent } from 'react'
import { AudioLines, CircleAlert, Trash2, Upload } from 'lucide-react'

import type { AudioClip } from '@/@types/audio'
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
import { Spinner } from '@/components/ui/spinner'
import { AUDIO_FILE_ACCEPT, importAudioFile, validateAudioFile } from '@/lib/import-audio'
import { cn } from '@/lib/utils'

export interface AudioImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (clips: AudioClip[]) => void | Promise<void>
  startFrame?: number
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

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return 'The audio file could not be imported.'
}

export function AudioImportDialog({
  open,
  onOpenChange,
  onImport,
  startFrame = 0
}: AudioImportDialogProps): React.JSX.Element {
  const inputId = useId()
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  function reset(): void {
    setFiles([])
    setError(null)
    setIsDragging(false)
    setIsImporting(false)
  }

  function handleOpenChange(nextOpen: boolean, eventDetails?: { reason?: string }): void {
    if (isImporting) return
    // A native file picker temporarily moves focus outside Electron. Keep the
    // controlled dialog mounted so the file input can receive its change event
    // when Windows returns focus to the editor.
    if (!nextOpen && eventDetails?.reason === 'focus-out') return
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  function selectFiles(files: File[]): void {
    if (files.length === 0) {
      setFiles([])
      setError('Choose one or more MP3, OGG, or WAV files.')
      return
    }

    const validationErrors = files
      .map((file) => validateAudioFile(file))
      .filter((message): message is string => Boolean(message))
    setFiles(validationErrors.length > 0 ? [] : files)
    setError(validationErrors.length > 0 ? validationErrors.join(' ') : null)
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault()
    setIsDragging(false)
    if (!isImporting) selectFiles(Array.from(event.dataTransfer.files))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (files.length === 0) return

    const validationErrors = files
      .map((file) => validateAudioFile(file))
      .filter((message): message is string => Boolean(message))
    if (validationErrors.length > 0) {
      setError(validationErrors.join(' '))
      return
    }

    setError(null)
    setIsImporting(true)
    try {
      const clips = await Promise.all(files.map((file) => importAudioFile(file, { startFrame })))
      await onImport(clips)
      reset()
      onOpenChange(false)
    } catch (importError) {
      setError(errorMessage(importError))
      setIsImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isImporting}
        className="overflow-hidden border border-border/80 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl sm:max-w-lg"
        aria-busy={isImporting}
      >
        <div className="border-b border-border/70 bg-gradient-to-r from-primary/10 to-transparent px-6 py-5">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base font-semibold">Import audio</DialogTitle>
            <DialogDescription className="mt-1">
              Add one or more MP3, OGG, or WAV tracks to the animation timeline.
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
              'group grid min-h-40 place-items-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-7 text-center transition-colors',
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
                {isImporting ? 'Decoding audio…' : 'Drop audio here or choose files'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">MP3, OGG, or WAV</p>
            </div>
            <Input
              id={inputId}
              type="file"
              accept={AUDIO_FILE_ACCEPT}
              multiple
              disabled={isImporting}
              aria-label="Choose audio files"
              className="sr-only"
              onChange={(event) => {
                selectFiles(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
          </label>

          {files.length > 0 ? (
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-border/70 bg-background/25 p-1.5">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5"
                >
                  <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <AudioLines className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{file.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {formatBytes(file.size)} · starts at frame{' '}
                      {Math.max(0, Math.round(startFrame))}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${file.name}`}
                    disabled={isImporting}
                    onClick={() => {
                      setFiles((selectedFiles) =>
                        selectedFiles.filter((_, selectedIndex) => selectedIndex !== index)
                      )
                      setError(null)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
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
              {isImporting
                ? 'Importing…'
                : files.length > 1
                  ? `Import ${files.length} tracks`
                  : 'Import audio'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
