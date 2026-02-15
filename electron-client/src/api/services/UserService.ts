import type { ErrorResponse } from '../models/ErrorResponse'
import type { UserProfile } from '../models/UserProfile'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'

export const UserService = {
  getCurrentUser(): CancelablePromise<UserProfile | ErrorResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/api/v1/me',
      errors: { 401: 'Unauthorized', 404: 'Not Found' },
    })
  },
}
