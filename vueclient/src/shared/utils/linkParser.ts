/**
 * Parses text and extracts URLs, replacing them with structured data
 */

export interface ParsedLink {
  type: 'text' | 'link' | 'gif'
  content: string
  url?: string
}

/**
 * Checks if a URL points to a GIF image
 */
export function isGifUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname.toLowerCase()
    const hostname = urlObj.hostname.toLowerCase()
    
    // Check file extension
    if (pathname.endsWith('.gif')) {
      return true
    }
    
    // Check common GIF hosting services
    const gifHosts = [
      'giphy.com',
      'tenor.com',
      'gfycat.com',
      'imgur.com',
      'media.giphy.com',
      'i.giphy.com',
    ]
    
    for (const host of gifHosts) {
      if (hostname.includes(host)) {
        // Check if it's actually a GIF (some hosts serve other formats)
        if (pathname.includes('/gif') || (urlObj.searchParams.has('format') && urlObj.searchParams.get('format') === 'gif')) {
          return true
        }
        // For imgur, check if URL contains /gif/ or ends with .gif
        if (hostname.includes('imgur.com') && (pathname.includes('/gif/') || pathname.endsWith('.gif'))) {
          return true
        }
        // For giphy and tenor, assume GIF if it's from their media domains
        if ((hostname.includes('giphy.com') || hostname.includes('tenor.com')) && (hostname.includes('media.') || hostname.includes('i.'))) {
          return true
        }
      }
    }
    
    return false
  } catch {
    return false
  }
}

/**
 * Parses text and extracts URLs, returning an array of parsed segments
 */
export function parseLinks(text: string): ParsedLink[] {
  const result: ParsedLink[] = []
  
  // Regex to match URLs (http, https, ftp, and common patterns)
  // Improved regex that handles trailing punctuation better
  const urlRegex = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s<>"']*)/gi
  
  let lastIndex = 0
  let match
  
  while ((match = urlRegex.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      const textBefore = text.substring(lastIndex, match.index)
      if (textBefore) {
        result.push({ type: 'text', content: textBefore })
      }
    }
    
    let url = match[0]
    let displayText = match[0]
    
    // Remove trailing punctuation that's not part of the URL
    // Common punctuation that shouldn't be part of URLs
    const trailingPunctuation = /[.,;:!?]+$/
    const punctuationMatch = url.match(trailingPunctuation)
    if (punctuationMatch && !url.match(/[.,;:!?]+\/[^/]/)) {
      // Only remove if it's not part of a path
      url = url.replace(trailingPunctuation, '')
    }
    
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }
    
    // Check if it's a GIF
    if (isGifUrl(url)) {
      result.push({ type: 'gif', content: displayText, url })
    } else {
      result.push({ type: 'link', content: displayText, url })
    }
    
    lastIndex = match.index + match[0].length
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    const textAfter = text.substring(lastIndex)
    if (textAfter) {
      result.push({ type: 'text', content: textAfter })
    }
  }
  
  // If no URLs found, return the whole text as a single text segment
  if (result.length === 0) {
    result.push({ type: 'text', content: text })
  }
  
  return result
}
