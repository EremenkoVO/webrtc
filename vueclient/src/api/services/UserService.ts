/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ErrorResponse } from '../models/ErrorResponse';
import type { UserProfile } from '../models/UserProfile';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class UserService {
    /**
     * Get current user profile
     * Retrieve details of the authenticated user.
     *
     * Requires a valid `Authorization: Bearer <access_token>` header.
     *
     * @returns UserProfile Current user profile
     * @returns ErrorResponse Unexpected server error
     * @throws ApiError
     */
    public static getCurrentUser(): CancelablePromise<UserProfile | ErrorResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/me',
            errors: {
                401: `Unauthorized`,
                404: `Resource Not Found`,
            },
        });
    }
}
