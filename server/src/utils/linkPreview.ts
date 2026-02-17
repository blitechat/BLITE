import https from 'https';
import http from 'http';

export interface OGMetadata {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

/**
 * Validate URL to prevent SSRF attacks
 */
function validateURL(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // Block localhost, private IPs, and internal networks
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variations
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('127.') ||
      hostname === '::1' ||
      hostname === '0000:0000:0000:0000:0000:0000:0000:0001'
    ) {
      return false;
    }

    // Block private IP ranges
    const privateIPRegex = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|fe80:|fc00:|fd)/;
    if (privateIPRegex.test(hostname)) {
      return false;
    }

    // Block internal TLDs
    const internalTLDs = ['.local', '.internal', '.private', '.corp', '.home', '.lan'];
    if (internalTLDs.some(tld => hostname.endsWith(tld))) {
      return false;
    }

    // Block file:// and other dangerous protocols
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch Open Graph metadata from a URL.
 * Returns partial metadata; missing fields are omitted.
 * Includes SSRF protection.
 */
export async function fetchLinkPreview(url: string): Promise<OGMetadata | null> {
  // Validate URL first (SSRF protection)
  if (!validateURL(url)) {
    console.warn('[LinkPreview] Blocked potentially dangerous URL:', url);
    return null;
  }

  try {
    const html = await fetchHTML(url);
    if (!html) return null;

    const title = extractMeta(html, 'og:title') || extractTitle(html);
    const description = extractMeta(html, 'og:description') || extractMeta(html, 'description');
    const image = extractMeta(html, 'og:image');
    const siteName = extractMeta(html, 'og:site_name');

    if (!title && !description) return null;

    return { url, title, description, image, siteName };
  } catch {
    return null;
  }
}

let redirectCount = 0;
const MAX_REDIRECTS = 5;

function fetchHTML(url: string, depth: number = 0): Promise<string | null> {
  return new Promise((resolve) => {
    // Prevent infinite redirect loops
    if (depth > MAX_REDIRECTS) {
      resolve(null);
      return;
    }

    // Re-validate URL after redirect
    if (!validateURL(url)) {
      resolve(null);
      return;
    }

    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'BLITE-Bot/1.0 (+https://blite.chat)',
        'Accept': 'text/html',
      }
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchHTML(res.headers.location, depth + 1).then(resolve);
        return;
      }
      if (res.statusCode !== 200) {
        resolve(null);
        return;
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
        // Only read the head portion (prevent memory exhaustion)
        if (data.length > 100000) {
          res.destroy();
          resolve(data.slice(0, 100000));
        }
      });
      res.on('end', () => resolve(data));
      res.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

function extractMeta(html: string, property: string): string | undefined {
  // Try og: and name= patterns
  const patterns = [
    new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i'),
    new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${property}["']`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  return undefined;
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1]?.trim();
}
