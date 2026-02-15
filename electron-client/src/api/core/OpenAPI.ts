import type { ApiRequestOptions } from './ApiRequestOptions'

type Resolver<T> = (options: ApiRequestOptions) => Promise<T>
type Headers = Record<string, string>

export type OpenAPIConfig = {
  BASE: string
  VERSION: string
  WITH_CREDENTIALS: boolean
  CREDENTIALS: 'include' | 'omit' | 'same-origin'
  TOKEN?: string | Resolver<string> | undefined
  USERNAME?: string | Resolver<string> | undefined
  PASSWORD?: string | Resolver<string> | undefined
  HEADERS?: Headers | Resolver<Headers> | undefined
  ENCODE_PATH?: ((path: string) => string) | undefined
}

export const OpenAPI: OpenAPIConfig = {
  BASE: '',
  VERSION: '1.0.0',
  WITH_CREDENTIALS: false,
  CREDENTIALS: 'include',
  TOKEN: undefined,
  USERNAME: undefined,
  PASSWORD: undefined,
  HEADERS: undefined,
  ENCODE_PATH: undefined,
}

/** Base URL for WebSocket (ws/wss). Uses OpenAPI.BASE, then VITE_API_URL; in Electron or when host is empty uses localhost:8080. */
export function getWsBaseUrl(): string {
  let base = OpenAPI.BASE || ''
  if (!base && typeof import.meta !== 'undefined' && (import.meta as ImportMeta).env?.VITE_API_URL) {
    base = (import.meta as ImportMeta).env.VITE_API_URL
  }
  if (!base) {
    const isElectron = typeof window !== 'undefined' && (window as Window & { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron
    const host = typeof window !== 'undefined' ? window.location?.host : ''
    if (isElectron || !host) {
      base = 'http://localhost:8080'
    } else {
      const protocol = window.location!.protocol === 'https:' ? 'wss:' : 'ws:'
      base = `${protocol}//${host}`
    }
  }
  return base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
}

const env = typeof import.meta !== 'undefined' ? (import.meta as ImportMeta).env : undefined

/** Base URL for chat WebSocket. If VITE_CHAT_WS_URL is set (e.g. http://localhost:3001), use it; else same as getWsBaseUrl(). */
export function getChatWsBaseUrl(): string {
  const chatUrl = env?.VITE_CHAT_WS_URL || ''
  if (chatUrl) return chatUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
  return getWsBaseUrl()
}

/** Path for chat WebSocket. Use /ws when pointing at chatserver directly (VITE_CHAT_WS_URL), else /api/v1/chat/ws (proxied). */
export function getChatWsPath(): string {
  return env?.VITE_CHAT_WS_URL ? '/ws' : '/api/v1/chat/ws'
}
