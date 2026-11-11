export const OUTPUT_IPC_CHANNELS = {
  openProject: 'output:open-project',
  acceptOpenProject: 'output:accept-open-project',
  saveProject: 'output:save-project',
  saveFile: 'output:save-file'
} as const

export type OutputFileKind = 'json' | 'png' | 'webm'

export interface SaveProjectRequest {
  projectId: string
  suggestedName: string
  contents: string
}

export interface SaveFileRequest {
  kind: OutputFileKind
  suggestedName: string
  contents: string | Uint8Array
}

export type OutputCancelledResult = {
  status: 'cancelled'
}

export type OutputErrorResult = {
  status: 'error'
  message: string
  code?: string
}

export type OpenProjectResult =
  | {
      status: 'opened'
      filePath: string
      contents: string
    }
  | OutputCancelledResult
  | OutputErrorResult

export type AcceptOpenProjectResult =
  | {
      status: 'accepted'
    }
  | OutputErrorResult

export type OutputSaveResult =
  | {
      status: 'saved'
      filePath: string
    }
  | OutputCancelledResult
  | OutputErrorResult

export interface DesktopOutputApi {
  openProject: () => Promise<OpenProjectResult>
  acceptOpenProject: (projectId: string) => Promise<AcceptOpenProjectResult>
  saveProject: (request: SaveProjectRequest) => Promise<OutputSaveResult>
  saveFile: (request: SaveFileRequest) => Promise<OutputSaveResult>
}
