export const OUTPUT_IPC_CHANNELS = {
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

export type OutputSaveResult =
  | {
      status: 'saved'
      filePath: string
    }
  | {
      status: 'cancelled'
    }
  | {
      status: 'error'
      message: string
      code?: string
    }

export interface DesktopOutputApi {
  saveProject: (request: SaveProjectRequest) => Promise<OutputSaveResult>
  saveFile: (request: SaveFileRequest) => Promise<OutputSaveResult>
}
