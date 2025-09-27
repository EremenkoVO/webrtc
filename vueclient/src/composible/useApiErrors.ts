import { ApiError } from '@/api/index'
import { computed, ref } from 'vue'

type ApiErrorResponse = {
  code?: string
  message?: string
}

export function useApiErrors() {
  const errorMessages = ref<string[]>([])

  const hasErrors = computed(() => {
    return errorMessages.value.length > 0
  })

  function parseApiError(error: unknown) {
    if (error && typeof error === 'object' && 'body' in error) {
      const apiError = error as ApiError
      const body = apiError.body as ApiErrorResponse

      console.log(typeof body)

      if (body?.message) {
        errorMessages.value.push(body.message)
        return
      }

      errorMessages.value = ['Неизвестная ошибка']
    }
  }

  function clearErrors() {
    errorMessages.value = []
  }

  return {
    errorMessages,
    hasErrors,
    parseApiError,
    clearErrors,
  }
}
