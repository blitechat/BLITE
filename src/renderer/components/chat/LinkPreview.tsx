import React, { useState, useEffect } from 'react'
import { ExternalLink } from 'lucide-react'
import type { LinkPreviewData } from '@shared/types'

interface LinkPreviewProps {
  url: string
}

const previewCache: Record<string, LinkPreviewData | null> = {}

/**
 * Fetch Open Graph metadata client-side to avoid leaking decrypted URLs to the server.
 * Falls back gracefully if CORS blocks the request.
 */
async function fetchPreviewClientSide(url: string): Promise<LinkPreviewData | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'text/html' },
    })
    clearTimeout(timeout)

    if (!response.ok) return null

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) return null

    const text = await response.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(text.slice(0, 50000), 'text/html')

    const getMeta = (property: string): string | undefined => {
      const el = doc.querySelector(`meta[property="${property}"]`) ||
                 doc.querySelector(`meta[name="${property}"]`)
      return el?.getAttribute('content') || undefined
    }

    const title = getMeta('og:title') || doc.querySelector('title')?.textContent || undefined
    const description = getMeta('og:description') || getMeta('description')
    const image = getMeta('og:image')
    const siteName = getMeta('og:site_name')

    if (!title && !description && !image) return null

    return { url, title, description, image, siteName }
  } catch {
    return null
  }
}

export default function LinkPreview({ url }: LinkPreviewProps) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(previewCache[url] || null)
  const [loading, setLoading] = useState(previewCache[url] === undefined)

  useEffect(() => {
    if (previewCache[url] !== undefined) {
      setPreview(previewCache[url])
      return
    }

    setLoading(true)
    fetchPreviewClientSide(url).then((data) => {
      previewCache[url] = data
      setPreview(data)
    }).catch(() => {
      previewCache[url] = null
    }).finally(() => {
      setLoading(false)
    })
  }, [url])

  if (loading || !preview) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-1.5 max-w-md rounded-lg border border-blite-glass-border overflow-hidden hover:border-blue-500/30 transition-colors"
      style={{ background: 'var(--blite-bg-tertiary)' }}
    >
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          className="w-full h-32 object-cover"
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <div className="px-3 py-2">
        {preview.siteName && (
          <p className="text-[10px] text-blite-text-muted uppercase tracking-wide">{preview.siteName}</p>
        )}
        {preview.title && (
          <p className="text-sm font-medium text-blue-400 line-clamp-1">{preview.title}</p>
        )}
        {preview.description && (
          <p className="text-xs text-blite-text-secondary line-clamp-2 mt-0.5">{preview.description}</p>
        )}
        <div className="flex items-center gap-1 mt-1 text-[10px] text-blite-text-muted">
          <ExternalLink size={10} />
          <span className="truncate">{new URL(url).hostname}</span>
        </div>
      </div>
    </a>
  )
}
