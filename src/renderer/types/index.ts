export interface ScreenSource {
  id: string
  name: string
  thumbnailDataUrl: string
  appIconDataUrl: string | null
}

export interface ElectronAPI {
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  isMaximized: () => Promise<boolean>
  encryptData: (data: string) => Promise<string>
  decryptData: (encrypted: string) => Promise<string>
  showNotification: (title: string, body: string) => void
  getScreenSources: () => Promise<ScreenSource[]>
  checkForUpdate: () => Promise<any>
  downloadUpdate: () => void
  installUpdate: () => void
  onUpdateAvailable: (callback: (_event: any, info: any) => void) => void
  onUpdateDownloaded: (callback: (_event: any, info: any) => void) => void
  onUpdateError: (callback: (_event: any, error: any) => void) => void
  platform: string
}

declare global {
  interface Window {
    api?: ElectronAPI
  }
}

export * from '../../../shared/types'
