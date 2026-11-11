import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  OUTPUT_IPC_CHANNELS,
  type DesktopOutputApi,
  type SaveFileRequest,
  type SaveProjectRequest
} from '../shared/output-api'

// Custom APIs for renderer
const api: DesktopOutputApi = {
  openProject: () => ipcRenderer.invoke(OUTPUT_IPC_CHANNELS.openProject),
  acceptOpenProject: (projectId: string) =>
    ipcRenderer.invoke(OUTPUT_IPC_CHANNELS.acceptOpenProject, projectId),
  saveProject: (request: SaveProjectRequest) =>
    ipcRenderer.invoke(OUTPUT_IPC_CHANNELS.saveProject, request),
  saveFile: (request: SaveFileRequest) => ipcRenderer.invoke(OUTPUT_IPC_CHANNELS.saveFile, request)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
