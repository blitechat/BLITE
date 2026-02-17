import React, { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

export default function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!window.api?.onUpdateAvailable) return

    window.api.onUpdateAvailable((_event, info) => {
      console.log('Update available:', info)
      setUpdateInfo(info)
      setUpdateAvailable(true)
      setDismissed(false)
    })

    window.api.onUpdateDownloaded((_event, info) => {
      console.log('Update downloaded:', info)
      setUpdateDownloaded(true)
      setDownloading(false)
    })

    window.api.onUpdateError((_event, error) => {
      console.error('Update error:', error)
      setDownloading(false)
    })
  }, [])

  const handleDownload = () => {
    setDownloading(true)
    window.api?.downloadUpdate()
  }

  const handleInstall = () => {
    window.api?.installUpdate()
  }

  const handleDismiss = () => {
    setDismissed(true)
  }

  if (!updateAvailable || dismissed) return null

  if (updateDownloaded) {
    return (
      <div className="fixed bottom-4 right-4 max-w-sm glass border border-blite-glass-border rounded-lg p-4 shadow-xl z-50 animate-slide-up">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blite-success/20 flex items-center justify-center flex-shrink-0">
            <Download size={20} className="text-blite-success" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-blite-text-primary mb-1">
              Update Ready
            </h3>
            <p className="text-xs text-blite-text-muted mb-3">
              Version {updateInfo?.version} has been downloaded and is ready to install.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-blite-success text-white hover:bg-blite-success/90 transition-colors"
              >
                Restart & Install
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-xs font-medium rounded-md text-blite-text-muted hover:bg-blite-bg-hover transition-colors"
              >
                Later
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-md text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 max-w-sm glass border border-blite-glass-border rounded-lg p-4 shadow-xl z-50 animate-slide-up">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-blite-accent/20 flex items-center justify-center flex-shrink-0">
          <Download size={20} className="gradient-text" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-blite-text-primary mb-1">
            Update Available
          </h3>
          <p className="text-xs text-blite-text-muted mb-3">
            Version {updateInfo?.version} is available. Would you like to download it?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="px-3 py-1.5 text-xs font-medium rounded-md gradient-accent text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloading ? 'Downloading...' : 'Download'}
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-1.5 text-xs font-medium rounded-md text-blite-text-muted hover:bg-blite-bg-hover transition-colors"
            >
              Later
            </button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 rounded-md text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
