import type { AuthTokens } from '../models/AuthTokens'
import type { ErrorResponse } from '../models/ErrorResponse'
import type { LoginRequest } from '../models/LoginRequest'
import type { RefreshRequest } from '../models/RefreshRequest'
import type { RegisterRequest } from '../models/RegisterRequest'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'

export const AuthService = {
  registerUser(requestBody: RegisterRequest): CancelablePromise<ErrorResponse | AuthTokens> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/api/v1/auth/register',
      body: requestBody,
      mediaType: 'application/json',
      errors: { 400: 'Bad Request', 409: 'Conflict', 422: 'Unprocessable Entity' },
    })
  },
  loginUser(requestBody: LoginRequest): CancelablePromise<AuthTokens | ErrorResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/api/v1/auth/login',
      body: requestBody,
      mediaType: 'application/json',
      errors: { 400: 'Bad Request', 401: 'Unauthorized', 422: 'Unprocessable Entity' },
    })
  },
  refreshToken(requestBody: RefreshRequest): CancelablePromise<AuthTokens | ErrorResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      body: requestBody,
      mediaType: 'application/json',
      errors: { 400: 'Bad Request', 401: 'Unauthorized', 422: 'Unprocessable Entity' },
    })
  },
  logoutUser(): CancelablePromise<ErrorResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/api/v1/auth/logout',
      errors: { 401: 'Unauthorized', 404: 'Not Found' },
    })
  },
}
