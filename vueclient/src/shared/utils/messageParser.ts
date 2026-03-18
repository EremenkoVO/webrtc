import { isGifUrl } from './linkParser'

export type Segment =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'strike'; content: string }
  | { type: 'code'; content: string }
  | { type: 'codeblock'; content: string }
  | { type: 'link'; content: string; url: string }
  | { type: 'gif'; content: string; url: string }

// Matches in priority order:
// 1. ```codeblock```
// 2. `inline code`
// 3. **bold**
// 4. ~~strikethrough~~
// 5. *italic* (after bold, so ** is not confused with *)
// 6. URLs
const PATTERN =
  /```([\s\S]*?)```|`([^`\n]+)`|\*\*([^*\n]+)\*\*|~~([^\n]+?)~~|\*([^*\n]+)\*|(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/g

export function parseMessage(text: string): Segment[] {
  const segments: Segment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  PATTERN.lastIndex = 0

  while ((match = PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }

    if (match[1] !== undefined) {
      segments.push({ type: 'codeblock', content: match[1].replace(/^\n/, '').replace(/\n$/, '') })
    } else if (match[2] !== undefined) {
      segments.push({ type: 'code', content: match[2] })
    } else if (match[3] !== undefined) {
      segments.push({ type: 'bold', content: match[3] })
    } else if (match[4] !== undefined) {
      segments.push({ type: 'strike', content: match[4] })
    } else if (match[5] !== undefined) {
      segments.push({ type: 'italic', content: match[5] })
    } else if (match[6] !== undefined) {
      const raw = match[6]
      const url = raw.startsWith('http') ? raw : 'https://' + raw
      segments.push(isGifUrl(url) ? { type: 'gif', content: raw, url } : { type: 'link', content: raw, url })
    }

    lastIndex = PATTERN.lastIndex
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) })
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', content: text })
  }

  return segments
}
