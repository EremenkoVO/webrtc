/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateDirectConversationRequest } from '../models/CreateDirectConversationRequest';
import type { DirectConversation } from '../models/DirectConversation';
import type { ErrorResponse } from '../models/ErrorResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ChatService {
    /**
     * List direct conversations for current user
     * @returns DirectConversation List of direct conversations
     * @returns ErrorResponse Unexpected server error
     * @throws ApiError
     */
    public static listDirectConversations(): CancelablePromise<Array<DirectConversation> | ErrorResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/dm/conversations',
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Create or get direct conversation
     * @param requestBody
     * @returns DirectConversation Existing direct conversation
     * @returns ErrorResponse Unexpected server error
     * @throws ApiError
     */
    public static createOrGetDirectConversation(
        requestBody: CreateDirectConversationRequest,
    ): CancelablePromise<DirectConversation | ErrorResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/dm/conversations',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get direct conversation details
     * @param id
     * @returns DirectConversation Direct conversation details
     * @returns ErrorResponse Unexpected server error
     * @throws ApiError
     */
    public static getDirectConversation(
        id: string,
    ): CancelablePromise<DirectConversation | ErrorResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/dm/conversations/{id}',
            path: {
                'id': id,
            },
            errors: {
                401: `Unauthorized`,
                404: `Resource Not Found`,
            },
        });
    }
    /**
     * WebSocket connection for text chat
     * Upgrade to a WebSocket connection for real-time text chat.
     * Authenticate via `token` query param (JWT).
     * Scope is specified with `scopeType` and `scopeId` query params:
     * - `scopeType=channel`, `scopeId=<roomId>` for text channels
     * - `scopeType=dm`, `scopeId=<conversationId>` for direct messages
     *
     * @param token
     * @param scopeType
     * @param scopeId
     * @param username
     * @returns void
     * @throws ApiError
     */
    public static chatWebSocket(
        token: string,
        scopeType: 'channel' | 'dm',
        scopeId: string,
        username?: string,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/chat/ws',
            query: {
                'token': token,
                'scopeType': scopeType,
                'scopeId': scopeId,
                'username': username,
            },
        });
    }
    /**
     * WebSocket connection for chat notifications
     * Upgrade to a WebSocket connection for realtime chat notifications across all scopes.
     * Authenticate via `token` query param (JWT).
     *
     * @param token
     * @returns void
     * @throws ApiError
     */
    public static chatNotificationsWebSocket(
        token: string,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/chat/notifications/ws',
            query: {
                'token': token,
            },
        });
    }
}
