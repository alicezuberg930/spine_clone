import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'

import {
  BrowserWindow,
  dialog,
  ipcMain,
  type FileFilter,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type SaveDialogOptions,
  type WebContents
} from 'electron'

import {
  OUTPUT_IPC_CHANNELS,
  type AcceptOpenProjectResult,
  type OpenProjectResult,
  type OutputErrorResult,
  type OutputFileKind,
  type OutputSaveResult,
  type SaveFileRequest,
  type SaveProjectRequest
} from '../shared/output-api'

interface OutputSpec {
  extension: string
  filters: FileFilter[]
  maxBytes: number
}

const MEBIBYTE = 1024 * 1024
const PROJECT_SPEC: OutputSpec = {
  extension: 'lfproj',
  filters: [{ name: 'Layerforge project', extensions: ['lfproj'] }],
  maxBytes: 1024 * MEBIBYTE
}

const OUTPUT_SPECS: Record<OutputFileKind, OutputSpec> = {
  json: {
    extension: 'json',
    filters: [{ name: 'JSON data', extensions: ['json'] }],
    maxBytes: 512 * MEBIBYTE
  },
  png: {
    extension: 'png',
    filters: [{ name: 'PNG image', extensions: ['png'] }],
    maxBytes: 512 * MEBIBYTE
  },
  webm: {
    extension: 'webm',
    filters: [{ name: 'WebM video', extensions: ['webm'] }],
    maxBytes: 2048 * MEBIBYTE
  }
}

const projectPaths = new Map<string, string>()
const pendingProjectPaths = new Map<number, { projectId: string; filePath: string }>()
const observedSenders = new Set<number>()

function errorResult(message: string, code?: string): OutputErrorResult {
  return code ? { status: 'error', message, code } : { status: 'error', message }
}

function validateSender(event: IpcMainInvokeEvent): OutputErrorResult | null {
  if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) {
    return errorResult('The output request did not come from the editor.', 'UNTRUSTED_SENDER')
  }

  const senderUrl = event.senderFrame.url
  const developmentUrl = process.env['ELECTRON_RENDERER_URL']
  const isDevelopmentPage = Boolean(developmentUrl && senderUrl.startsWith(developmentUrl))

  const isPackagedPage = (() => {
    try {
      return new URL(senderUrl).protocol === 'file:'
    } catch {
      return false
    }
  })()

  return isDevelopmentPage || isPackagedPage
    ? null
    : errorResult('The output request came from an untrusted page.', 'UNTRUSTED_SENDER')
}

function observeSender(sender: WebContents): void {
  if (observedSenders.has(sender.id)) return
  observedSenders.add(sender.id)

  sender.once('destroyed', () => {
    observedSenders.delete(sender.id)
    pendingProjectPaths.delete(sender.id)
    const prefix = `${sender.id}:`
    for (const key of projectPaths.keys()) {
      if (key.startsWith(prefix)) projectPaths.delete(key)
    }
  })
}

function safeSuggestedName(value: unknown, extension: string): string {
  const fallback = `untitled.${extension}`
  if (typeof value !== 'string') return fallback

  const withoutControlCharacters = [...basename(value)]
    .filter((character) => (character.codePointAt(0) ?? 0) >= 32)
    .join('')
  const safeBaseName = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 160)

  if (!safeBaseName) return fallback
  return safeBaseName.toLowerCase().endsWith(`.${extension}`)
    ? safeBaseName
    : `${safeBaseName}.${extension}`
}

function withRequiredExtension(filePath: string, extension: string): string {
  return extname(filePath).toLowerCase() === `.${extension}` ? filePath : `${filePath}.${extension}`
}

function byteLength(contents: string | Uint8Array): number {
  return typeof contents === 'string' ? Buffer.byteLength(contents, 'utf8') : contents.byteLength
}

function bytes(contents: string | Uint8Array): Uint8Array {
  return typeof contents === 'string' ? Buffer.from(contents, 'utf8') : contents
}

function hasBytesAt(contents: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => contents[offset + index] === value)
}

function containsBytes(contents: Uint8Array, expected: readonly number[]): boolean {
  if (expected.length === 0 || contents.length < expected.length) return false
  for (let offset = 0; offset <= contents.length - expected.length; offset += 1) {
    if (hasBytesAt(contents, offset, expected)) return true
  }
  return false
}

function validateJsonOutput(contents: string | Uint8Array): OutputSaveResult | null {
  try {
    const parsed = JSON.parse(Buffer.from(bytes(contents)).toString('utf8')) as unknown
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !('format' in parsed) ||
      parsed.format !== 'layerforge-runtime' ||
      !('version' in parsed) ||
      parsed.version !== 1
    ) {
      return errorResult(
        'The runtime data does not contain a supported Layerforge document.',
        'INVALID_JSON_OUTPUT'
      )
    }
  } catch {
    return errorResult('The runtime data is not valid JSON.', 'INVALID_JSON_OUTPUT')
  }
  return null
}

function validatePngOutput(contents: string | Uint8Array): OutputSaveResult | null {
  const data = bytes(contents)
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const
  const ihdr = [0x49, 0x48, 0x44, 0x52] as const
  const iend = [0x49, 0x45, 0x4e, 0x44] as const
  if (
    data.length < 45 ||
    !hasBytesAt(data, 0, pngSignature) ||
    !hasBytesAt(data, 12, ihdr) ||
    !hasBytesAt(data, data.length - 8, iend)
  ) {
    return errorResult('The rendered image is not a complete PNG file.', 'INVALID_PNG_OUTPUT')
  }
  return null
}

function validateWebmOutput(contents: string | Uint8Array): OutputSaveResult | null {
  const data = bytes(contents)
  const ebml = [0x1a, 0x45, 0xdf, 0xa3] as const
  const segment = [0x18, 0x53, 0x80, 0x67] as const
  const tracks = [0x16, 0x54, 0xae, 0x6b] as const
  const cluster = [0x1f, 0x43, 0xb6, 0x75] as const
  if (
    data.length < 32 ||
    !hasBytesAt(data, 0, ebml) ||
    !containsBytes(data, segment) ||
    !containsBytes(data, tracks) ||
    !containsBytes(data, cluster)
  ) {
    return errorResult('The recorded video is not a complete WebM file.', 'INVALID_WEBM_OUTPUT')
  }
  return null
}

function validateOutputFormat(
  kind: OutputFileKind,
  contents: string | Uint8Array
): OutputSaveResult | null {
  if (kind === 'json') return validateJsonOutput(contents)
  if (kind === 'png') return validatePngOutput(contents)
  return validateWebmOutput(contents)
}

function validateContents(
  contents: unknown,
  spec: OutputSpec,
  expectedType: 'text' | 'binary' | 'either'
): OutputSaveResult | null {
  const isText = typeof contents === 'string'
  const isBinary = contents instanceof Uint8Array

  if (!isText && !isBinary) {
    return errorResult('The output data is not a supported string or byte array.', 'INVALID_DATA')
  }
  if (expectedType === 'text' && !isText) {
    return errorResult('This output must be UTF-8 text.', 'INVALID_DATA')
  }
  if (expectedType === 'binary' && !isBinary) {
    return errorResult('This output must be binary data.', 'INVALID_DATA')
  }

  const size = byteLength(contents)
  if (size === 0) return errorResult('There is no output data to save.', 'EMPTY_OUTPUT')
  if (size > spec.maxBytes) {
    return errorResult(
      `The output is too large to save safely (${Math.ceil(size / MEBIBYTE)} MiB).`,
      'OUTPUT_TOO_LARGE'
    )
  }

  return null
}

function writeError(error: unknown): OutputErrorResult {
  const code = error instanceof Error && 'code' in error ? String(error.code) : undefined

  if (code === 'ENOSPC')
    return errorResult('The destination does not have enough free space.', code)
  if (code === 'EACCES' || code === 'EPERM') {
    return errorResult('The app does not have permission to write to that destination.', code)
  }
  if (code === 'ENOENT')
    return errorResult('The selected destination is no longer available.', code)

  return errorResult(
    'The file could not be written. Choose another destination and try again.',
    code
  )
}

function readError(error: unknown): OutputErrorResult {
  const code = error instanceof Error && 'code' in error ? String(error.code) : undefined

  if (code === 'ENOENT') return errorResult('The selected project is no longer available.', code)
  if (code === 'EACCES' || code === 'EPERM') {
    return errorResult('The app does not have permission to read the selected project.', code)
  }
  if (code === 'EISDIR') {
    return errorResult('The selected project is not a regular file.', 'INVALID_PROJECT_FILE')
  }

  return errorResult('The selected project could not be read.', code)
}

async function chooseDestination(
  event: IpcMainInvokeEvent,
  suggestedName: string,
  spec: OutputSpec,
  title: string
): Promise<string | null> {
  const options: SaveDialogOptions = {
    title,
    defaultPath: safeSuggestedName(suggestedName, spec.extension),
    filters: spec.filters,
    properties: ['showOverwriteConfirmation']
  }
  const owner = BrowserWindow.fromWebContents(event.sender)
  const result = owner
    ? await dialog.showSaveDialog(owner, options)
    : await dialog.showSaveDialog(options)

  return result.canceled || !result.filePath
    ? null
    : withRequiredExtension(result.filePath, spec.extension)
}

async function writeOutput(
  filePath: string,
  contents: string | Uint8Array
): Promise<OutputSaveResult> {
  try {
    await writeFile(filePath, contents)
    const writtenFile = await stat(filePath)
    if (!writtenFile.isFile() || writtenFile.size !== byteLength(contents)) {
      return errorResult(
        'The destination did not contain the complete output after writing.',
        'INCOMPLETE_WRITE'
      )
    }
    return { status: 'saved', filePath }
  } catch (error) {
    return writeError(error)
  }
}

function projectIdFromContents(contents: string): string | OutputErrorResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(contents) as unknown
  } catch {
    return errorResult('The selected project is not valid JSON.', 'INVALID_PROJECT_FILE')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return errorResult('The selected file is not a Layerforge project.', 'INVALID_PROJECT_FILE')
  }

  const document = parsed as Record<string, unknown>
  if (document.format !== 'layerforge-project') {
    return errorResult('The selected file is not a Layerforge project.', 'INVALID_PROJECT_FILE')
  }
  if (document.version !== 1) {
    return errorResult(
      'This project was created by an unsupported Layerforge version.',
      'UNSUPPORTED_PROJECT_VERSION'
    )
  }
  if (
    !document.project ||
    typeof document.project !== 'object' ||
    Array.isArray(document.project)
  ) {
    return errorResult('The project data is missing or invalid.', 'INVALID_PROJECT')
  }

  const projectId = (document.project as Record<string, unknown>).id
  if (typeof projectId !== 'string' || projectId.trim().length === 0 || projectId.length > 200) {
    return errorResult('The project does not have a valid identifier.', 'INVALID_PROJECT')
  }

  return projectId
}

async function handleOpenProject(event: IpcMainInvokeEvent): Promise<OpenProjectResult> {
  const senderError = validateSender(event)
  if (senderError) return senderError
  observeSender(event.sender)
  pendingProjectPaths.delete(event.sender.id)

  const options: OpenDialogOptions = {
    title: 'Open project',
    filters: PROJECT_SPEC.filters,
    properties: ['openFile']
  }
  const owner = BrowserWindow.fromWebContents(event.sender)
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options)
  const filePath = result.filePaths[0]
  if (result.canceled || !filePath) return { status: 'cancelled' }

  try {
    const selectedFile = await stat(filePath)
    if (!selectedFile.isFile()) {
      return errorResult('The selected project is not a regular file.', 'INVALID_PROJECT_FILE')
    }
    if (selectedFile.size === 0) {
      return errorResult('The selected project file is empty.', 'EMPTY_PROJECT')
    }
    if (selectedFile.size > PROJECT_SPEC.maxBytes) {
      return errorResult(
        `The selected project is too large to open safely (${Math.ceil(selectedFile.size / MEBIBYTE)} MiB).`,
        'PROJECT_TOO_LARGE'
      )
    }

    const contents = await readFile(filePath, 'utf8')
    const size = Buffer.byteLength(contents, 'utf8')
    if (size === 0) return errorResult('The selected project file is empty.', 'EMPTY_PROJECT')
    if (size > PROJECT_SPEC.maxBytes) {
      return errorResult(
        `The selected project is too large to open safely (${Math.ceil(size / MEBIBYTE)} MiB).`,
        'PROJECT_TOO_LARGE'
      )
    }

    const projectId = projectIdFromContents(contents)
    if (typeof projectId !== 'string') return projectId

    pendingProjectPaths.set(event.sender.id, { projectId, filePath })
    return { status: 'opened', filePath, contents }
  } catch (error) {
    return readError(error)
  }
}

async function handleAcceptOpenProject(
  event: IpcMainInvokeEvent,
  projectId: string
): Promise<AcceptOpenProjectResult> {
  const senderError = validateSender(event)
  if (senderError) return senderError
  observeSender(event.sender)

  const pending = pendingProjectPaths.get(event.sender.id)
  if (!pending) {
    return errorResult('There is no opened project waiting to be accepted.', 'NO_PENDING_PROJECT')
  }
  if (typeof projectId !== 'string' || projectId !== pending.projectId) {
    pendingProjectPaths.delete(event.sender.id)
    return errorResult(
      'The opened project identifier did not match the validated project.',
      'PROJECT_ID_MISMATCH'
    )
  }

  pendingProjectPaths.delete(event.sender.id)
  projectPaths.set(`${event.sender.id}:${projectId}`, pending.filePath)
  return { status: 'accepted' }
}

async function handleSaveProject(
  event: IpcMainInvokeEvent,
  request: SaveProjectRequest
): Promise<OutputSaveResult> {
  const senderError = validateSender(event)
  if (senderError) return senderError
  observeSender(event.sender)

  if (
    !request ||
    typeof request.projectId !== 'string' ||
    request.projectId.length === 0 ||
    request.projectId.length > 200
  ) {
    return errorResult('The project does not have a valid identifier.', 'INVALID_PROJECT')
  }

  const contentsError = validateContents(request.contents, PROJECT_SPEC, 'text')
  if (contentsError) return contentsError

  const projectKey = `${event.sender.id}:${request.projectId}`
  let filePath = projectPaths.get(projectKey)
  if (!filePath) {
    filePath =
      (await chooseDestination(event, request.suggestedName, PROJECT_SPEC, 'Save project')) ??
      undefined
    if (!filePath) return { status: 'cancelled' }
  }

  const result = await writeOutput(filePath, request.contents)
  if (result.status === 'saved') projectPaths.set(projectKey, filePath)
  return result
}

async function handleSaveFile(
  event: IpcMainInvokeEvent,
  request: SaveFileRequest
): Promise<OutputSaveResult> {
  const senderError = validateSender(event)
  if (senderError) return senderError
  observeSender(event.sender)

  if (!request || !Object.hasOwn(OUTPUT_SPECS, request.kind)) {
    return errorResult('The requested output format is not supported.', 'UNSUPPORTED_FORMAT')
  }

  const spec = OUTPUT_SPECS[request.kind]
  const expectedType = request.kind === 'json' ? 'either' : 'binary'
  const contentsError = validateContents(request.contents, spec, expectedType)
  if (contentsError) return contentsError
  const formatError = validateOutputFormat(request.kind, request.contents)
  if (formatError) return formatError

  const filePath = await chooseDestination(
    event,
    request.suggestedName,
    spec,
    request.kind === 'json'
      ? 'Export data'
      : request.kind === 'png'
        ? 'Export image'
        : 'Export video'
  )
  if (!filePath) return { status: 'cancelled' }

  return writeOutput(filePath, request.contents)
}

export function registerOutputIpc(): void {
  ipcMain.handle(OUTPUT_IPC_CHANNELS.openProject, handleOpenProject)
  ipcMain.handle(OUTPUT_IPC_CHANNELS.acceptOpenProject, handleAcceptOpenProject)
  ipcMain.handle(OUTPUT_IPC_CHANNELS.saveProject, handleSaveProject)
  ipcMain.handle(OUTPUT_IPC_CHANNELS.saveFile, handleSaveFile)
}
