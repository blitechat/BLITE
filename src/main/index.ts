import { app, shell, BrowserWindow, ipcMain, Notification, safeStorage, desktopCapturer } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'

let mainWindow: BrowserWindow | null = null

// Configure auto-updater
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

// Set update server URL
if (!is.dev) {
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: 'https://blite.chat/downloads'
  })
}

// Auto-updater event handlers
autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info)
  mainWindow?.webContents.send('update:available', info)
})

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info)
  mainWindow?.webContents.send('update:downloaded', info)
})

autoUpdater.on('error', (err) => {
  console.error('Update error:', err)
  mainWindow?.webContents.send('update:error', err.message)
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1a1a2e',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      experimentalFeatures: true
    }
  })

  // Allow loading images/assets from blite.chat and the app itself
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const url = new URL(details.url)
    const allowed = ['blite.chat', 'localhost', '127.0.0.1']
    if (allowed.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Access-Control-Allow-Origin': ['*']
        }
      })
    } else {
      callback({ responseHeaders: details.responseHeaders })
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.blite.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC: Window controls
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow?.close())
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized())

  // IPC: Safe storage for encryption keys
  ipcMain.handle('crypto:encrypt', (_event, data: string) => {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(data)
      return encrypted.toString('base64')
    }
    return data
  })

  ipcMain.handle('crypto:decrypt', (_event, encryptedBase64: string) => {
    if (safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(encryptedBase64, 'base64')
      return safeStorage.decryptString(buffer)
    }
    return encryptedBase64
  })

  // IPC: Desktop notifications
  ipcMain.on('notification:show', (_event, { title, body }: { title: string; body: string }) => {
    new Notification({ title, body }).show()
  })

  // IPC: Screen capture sources
  ipcMain.handle('screen:getSources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    })
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnailDataUrl: source.thumbnail.toDataURL(),
      appIconDataUrl: source.appIcon ? source.appIcon.toDataURL() : null
    }))
  })

  // IPC: Auto-updater
  ipcMain.handle('update:check', async () => {
    if (is.dev) return null
    try {
      const result = await autoUpdater.checkForUpdates()
      return result?.updateInfo || null
    } catch (err) {
      console.error('Failed to check for updates:', err)
      return null
    }
  })

  ipcMain.on('update:download', () => {
    if (!is.dev) {
      autoUpdater.downloadUpdate()
    }
  })

  ipcMain.on('update:install', () => {
    if (!is.dev) {
      autoUpdater.quitAndInstall()
    }
  })

  createWindow()

  // Check for updates 5 seconds after app starts (give time for window to load)
  if (!is.dev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        console.error('Auto-update check failed:', err)
      })
    }, 5000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
