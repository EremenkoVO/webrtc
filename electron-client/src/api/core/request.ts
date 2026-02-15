import { ApiError } from './ApiError'
import type { ApiRequestOptions } from './ApiRequestOptions'
import type { ApiResult } from './ApiResult'
import { CancelablePromise } from './CancelablePromise'
import type { OnCancel } from './CancelablePromise'
import type { OpenAPIConfig } from './OpenAPI'

export const isDefined = <T>(value: T | null | undefined): value is NonNullable<T> =>
  value !== undefined && value !== null

export const isString = (value: unknown): value is string => typeof value === 'string'
export const isStringWithValue = (value: unknown): value is string =>
  isString(value) && value !== ''

export const getQueryString = (params: Record<string, unknown>): string => {
  const qs: string[] = []
  const append = (key: string, value: unknown) => {
    qs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  }
  const process = (key: string, value: unknown) => {
    if (isDefined(value)) {
      if (Array.isArray(value)) value.forEach((v) => process(key, v))
      else if (typeof value === 'object' && value !== null)
        Object.entries(value as Record<string, unknown>).forEach(([k, v]) =>
          process(`${key}[${k}]`, v)
        )
      else append(key, value)
    }
  }
  Object.entries(params).forEach(([key, value]) => process(key, value))
  return qs.length > 0 ? `?${qs.join('&')}` : ''
}

const getUrl = (config: OpenAPIConfig, options: ApiRequestOptions): string => {
  const encoder = config.ENCODE_PATH || encodeURI
  const path = options.url
    .replace('{api-version}', config.VERSION)
    .replace(/\{(.*?)\}/g, (_sub, group: string) => {
      if (options.path && Object.prototype.hasOwnProperty.call(options.path, group))
        return encoder(String(options.path[group]))
      return _sub
    })
  const url = `${config.BASE}${path}`
  return options.query ? `${url}${getQueryString(options.query)}` : url
}

type Resolver<T> = (options: ApiRequestOptions) => Promise<T>
const resolve = async <T>(
  options: ApiRequestOptions,
  resolver?: T | Resolver<T>
): Promise<T | undefined> => {
  if (typeof resolver === 'function') return (resolver as Resolver<T>)(options)
  return resolver as T
}

export const getHeaders = async (
  config: OpenAPIConfig,
  options: ApiRequestOptions
): Promise<Headers> => {
  const [token, , , additionalHeaders] = await Promise.all([
    resolve(options, config.TOKEN),
    resolve(options, config.USERNAME),
    resolve(options, config.PASSWORD),
    resolve(options, config.HEADERS),
  ])
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(additionalHeaders as Record<string, string>),
    ...(options.headers as Record<string, string>),
  }
  Object.keys(headers).forEach((k) => {
    if (headers[k] == null) delete headers[k]
  })
  if (isStringWithValue(token)) headers['Authorization'] = `Bearer ${token}`
  if (options.body !== undefined && typeof options.body === 'object' && !(options.body instanceof FormData))
    headers['Content-Type'] = options.mediaType || 'application/json'
  return new Headers(headers)
}

export const getRequestBody = (options: ApiRequestOptions): unknown => {
  if (options.body === undefined) return undefined
  if (options.mediaType?.includes('/json')) return JSON.stringify(options.body)
  return options.body
}

export const sendRequest = async (
  config: OpenAPIConfig,
  options: ApiRequestOptions,
  url: string,
  body: unknown,
  headers: Headers,
  onCancel: OnCancel
): Promise<Response> => {
  const controller = new AbortController()
  const request: RequestInit = {
    headers,
    body: body as BodyInit ?? undefined,
    method: options.method,
    signal: controller.signal,
  }
  if (config.WITH_CREDENTIALS) request.credentials = config.CREDENTIALS
  onCancel(() => controller.abort())
  return fetch(url, request)
}

const getResponseBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204) return undefined
  const contentType = response.headers.get('Content-Type')
  if (contentType?.toLowerCase().startsWith('application/json'))
    return response.json()
  return response.text()
}

export const catchErrorCodes = (options: ApiRequestOptions, result: ApiResult): void => {
  const errors: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    500: 'Internal Server Error',
    ...options.errors,
  }
  const err = errors[result.status]
  if (err) throw new ApiError(options, result, err)
  if (!result.ok)
    throw new ApiError(
      options,
      result,
      `Error: ${result.status} ${result.statusText}; body: ${JSON.stringify(result.body)}`
    )
}

export const request = <T>(
  config: OpenAPIConfig,
  options: ApiRequestOptions
): CancelablePromise<T> => {
  return new CancelablePromise<T>(async (resolve, reject, onCancel) => {
    try {
      const url = getUrl(config, options)
      const body = getRequestBody(options)
      const headers = await getHeaders(config, options)
      if (onCancel.isCancelled) return
      const response = await sendRequest(config, options, url, body, headers, onCancel)
      const responseBody = await getResponseBody(response)
      const result: ApiResult = {
        url,
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        body: responseBody,
      }
      catchErrorCodes(options, result)
      resolve(result.body as T)
    } catch (error) {
      reject(error)
    }
  })
}
