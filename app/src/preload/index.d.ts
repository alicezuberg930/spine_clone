import { ElectronAPI } from '@electron-toolkit/preload'
import type { DesktopOutputApi } from '../shared/output-api'

declare global {
  interface Window {
    electron: ElectronAPI
    api: DesktopOutputApi
  }
}
