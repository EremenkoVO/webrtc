/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { AuthTokens } from '../models/AuthTokens';
import type { ErrorResponse } from '../models/ErrorResponse';
import type { LoginRequest } from '../models/LoginRequest';
import type { RefreshRequest } from '../models/RefreshRequest';
import type { RegisterRequest } from '../models/RegisterRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AuthService {
    /**
     * Register new user
     * Create a new user account with password, and username.
     *
     * **Request body:**
     * ```json
     * {
         * "password": "string",
         * "name": "John Doe"
         * }
         * ```
         *
         * **Successful response:**
         * Returns `access_token` and `refresh_token` with expiration times.
         *
         * @param requestBody
         * @returns ErrorResponse Unexpected server error
         * @returns AuthTokens User successfully registered
         * @throws ApiError
         */
        public static registerUser(
            requestBody: RegisterRequest,
        ): CancelablePromise<ErrorResponse | AuthTokens> {
            return __request(OpenAPI, {
                method: 'POST',
                url: '/api/v1/auth/register',
                body: requestBody,
                mediaType: 'application/json',
                errors: {
                    400: `Bad Request`,
                    409: `Conflict - User already exists`,
                    422: `Unprocessable Entity`,
                },
            });
        }
        /**
         * User login
         * Authenticate user with username and password.
         *
         * **Request body:**
         * ```json
         * {
             * "username": "usertest",
             * "password": "string"
             * }
             * ```
             *
             * **Successful response:**
             * Returns `access_token` and `refresh_token` with expiration times.
             *
             * @param requestBody
             * @returns AuthTokens Successful login
             * @returns ErrorResponse Unexpected server error
             * @throws ApiError
             */
            public static loginUser(
                requestBody: LoginRequest,
            ): CancelablePromise<AuthTokens | ErrorResponse> {
                return __request(OpenAPI, {
                    method: 'POST',
                    url: '/api/v1/auth/login',
                    body: requestBody,
                    mediaType: 'application/json',
                    errors: {
                        400: `Bad Request`,
                        401: `Unauthorized`,
                        422: `Unprocessable Entity`,
                    },
                });
            }
            /**
             * Refresh access token
             * Exchange a valid `refresh_token` for a new `access_token`.
             *
             * **Request body:**
             * ```json
             * {
                 * "refresh_token": "string"
                 * }
                 * ```
                 *
                 * **Successful response:**
                 * Returns a new `access_token` with expiration time.
                 *
                 * @param requestBody
                 * @returns AuthTokens Successful token refresh
                 * @returns ErrorResponse Unexpected server error
                 * @throws ApiError
                 */
                public static refreshToken(
                    requestBody: RefreshRequest,
                ): CancelablePromise<AuthTokens | ErrorResponse> {
                    return __request(OpenAPI, {
                        method: 'POST',
                        url: '/api/v1/auth/refresh',
                        body: requestBody,
                        mediaType: 'application/json',
                        errors: {
                            400: `Bad Request`,
                            401: `Unauthorized`,
                            422: `Unprocessable Entity`,
                        },
                    });
                }
                /**
                 * Logout user
                 * Invalidate the current session tokens.
                 *
                 * Requires a valid `Authorization: Bearer <access_token>` header.
                 *
                 * @returns ErrorResponse Unexpected server error
                 * @throws ApiError
                 */
                public static logoutUser(): CancelablePromise<ErrorResponse> {
                    return __request(OpenAPI, {
                        method: 'POST',
                        url: '/api/v1/auth/logout',
                        errors: {
                            401: `Unauthorized`,
                            404: `Resource Not Found`,
                        },
                    });
                }
            }
