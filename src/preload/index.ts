import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Safe storage for encryption keys
  encryptData: (data: string) => ipcRenderer.invoke('crypto:encrypt', data),
  decryptData: (encrypted: string) => ipcRenderer.invoke('crypto:decrypt', encrypted),

  // Desktop notifications
  showNotification: (title: string, body: string) =>
    ipcRenderer.send('notification:show', { title, body }),

  // Screen capture
  getScreenSources: () => ipcRenderer.invoke('screen:getSources'),

  // Auto-updater
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.send('update:download'),
  installUpdate: () => ipcRenderer.send('update:install'),
  onUpdateAvailable: (callback: (_event: any, info: any) => void) => ipcRenderer.on('update:available', callback),
  onUpdateDownloaded: (callback: (_event: any, info: any) => void) => ipcRenderer.on('update:downloaded', callback),
  onUpdateError: (callback: (_event: any, error: any) => void) => ipcRenderer.on('update:error', callback),

  // Platform info
  platform: process.platform
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
