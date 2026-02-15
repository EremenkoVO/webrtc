import { useState, useCallback, useMemo } from 'react'
import type { ApiError } from '@/api'

type ApiErrorResponse = { code?: string; message?: string }

export function useApiErrors() {
  const [errorMessages, setErrorMessages] = useState<string[]>([])

  const hasErrors = errorMessages.length > 0

  const parseApiError = useCallback((error: unknown) => {
    if (error && typeof error === 'object' && 'body' in error) {
      const apiError = error as ApiError
      const body = apiError.body as ApiErrorResponse
      if (body?.message) {
        setErrorMessages((prev) => [...prev, body.message!])
        return
      }
    }
    setErrorMessages((prev) => [...prev, 'Неизвестная ошибка'])
  }, [])

  const clearErrors = useCallback(() => setErrorMessages([]), [])

  return useMemo(
    () => ({ errorMessages, hasErrors, parseApiError, clearErrors }),
    [errorMessages, hasErrors, parseApiError, clearErrors]
  )
}
