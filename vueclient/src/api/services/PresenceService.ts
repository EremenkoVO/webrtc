/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class PresenceService {
    /**
     * WebSocket connection for global user presence
     * Upgrade to a WebSocket connection for real-time global presence updates.
     * Authenticate via `token` query param (JWT).
     *
     * Server emits:
     * - `presence_snapshot` with currently online user IDs
     * - `user_online` when a user comes online
     * - `user_offline` when a user goes offline
     *
     * @param token
     * @returns void
     * @throws ApiError
     */
    public static presenceWebSocket(
        token: string,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/presence/ws',
            query: {
                'token': token,
            },
        });
    }
}
