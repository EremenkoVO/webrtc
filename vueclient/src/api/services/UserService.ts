/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
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
     * Update profile fields for the authenticated user.
     *
     * @param requestBody
     * @returns UserProfile Updated user profile
     * @returns ErrorResponse Unexpected server error
     * @throws ApiError
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
     * List all registered users on the server
     * Returns every user account (directory / address book). Optional `avatar_url` is present when the user has uploaded an avatar.
     *
     * Requires a valid `Authorization: Bearer <access_token>` header.
     *
     * @returns UserProfile List of users
     * @returns ErrorResponse Unexpected server error
     * @throws ApiError
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
     * @param username
     * @returns UserProfile Public profile card
     * @returns ErrorResponse Unexpected server error
     * @throws ApiError
     */
    public static getPublicUserProfile(
        username: string,
    ): CancelablePromise<UserProfile | ErrorResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/users/{username}/profile',
            path: {
                'username': username,
            },
            errors: {
                404: `Resource Not Found`,
            },
        });
    }
}
