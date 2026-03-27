/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { ErrorResponse } from '../models/ErrorResponse';
import type { UpdateProfileRequest } from '../models/UpdateProfileRequest';
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

    /**
     * Update current user profile
     */
    public static updateCurrentUserProfile(
        requestBody: UpdateProfileRequest,
    ): CancelablePromise<UserProfile | ErrorResponse> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/me',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
            },
        });
    }

    /**
     * List all registered users on the server (directory).
     */
    public static listServerUsers(): CancelablePromise<Array<UserProfile> | ErrorResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/users',
            errors: {
                401: `Unauthorized`,
            },
        });
    }

    /**
     * Get public user profile
     */
    public static getPublicUserProfile(
        username: string,
    ): CancelablePromise<UserProfile | ErrorResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/users/{username}/profile',
            path: {
                username: username,
            },
            errors: {
                404: `Resource Not Found`,
            },
        });
    }

    /**
     * Upload avatar for the current user.
     * Sends multipart/form-data with field "avatar". Max 5 MB.
     * Content-Type is auto-detected server-side (JPEG, PNG, WebP, GIF).
     */
    public static async uploadAvatar(blob: Blob): Promise<void> {
        const token = typeof OpenAPI.TOKEN === 'string' ? OpenAPI.TOKEN : ''
        const formData = new FormData()
        formData.append('avatar', blob, 'avatar.jpg')
        const res = await fetch(`${OpenAPI.BASE}/api/v1/me/avatar`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        })
        if (!res.ok) {
            throw new Error(`Avatar upload failed: ${res.status}`)
        }
    }

    public static async changePassword(currentPassword: string, newPassword: string): Promise<void> {
        const token = typeof OpenAPI.TOKEN === 'string' ? OpenAPI.TOKEN : ''
        const res = await fetch(`${OpenAPI.BASE}/api/v1/me/password`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
        })
        if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw { status: res.status, body }
        }
    }
}
