// Central production URL — update this when changing hosting provider
export const PRODUCTION_URL = 'https://blite.chat'

/**
 * Get the backend base URL (without /api suffix)
 * Used by both API calls and asset loading for consistency
 */
export function getBackendUrl(): string {
  const isElectron = typeof window !== 'undefined' && !!window.api
  const viteUrl = import.meta.env.VITE_API_URL
  const override = typeof window !== 'undefined' && localStorage.getItem('blite_backend_url')

  let baseUrl: string

  // Priority order: localStorage override > VITE_API_URL > defaults
  if (override) {
    baseUrl = override
  } else if (viteUrl && !(isElectron && viteUrl.startsWith('/'))) {
    // Remove /api suffix if present
    baseUrl = viteUrl.replace(/\/api$/, '')
  } else if (isElectron) {
    // For Electron, always use production URL (it's running as installed app)
    // Exception: if connecting to localhost backend, user should set localStorage override
    baseUrl = PRODUCTION_URL
  } else {
    // Web browser defaults to localhost for development
    baseUrl = 'http://localhost:3001'
  }

  return baseUrl
}

/**
 * Resolve asset URLs (uploads, avatars) to the correct backend origin
 * Uses the same base URL as the API for consistency
 */
export function getAssetUrl(path: string): string {
  if (!path) return path

  // Already a full URL
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path
  }

  // Relative path - resolve to API base URL
  if (path.startsWith('/')) {
    const baseUrl = getBackendUrl()
    return `${baseUrl}${path}`
  }

  return path
}
