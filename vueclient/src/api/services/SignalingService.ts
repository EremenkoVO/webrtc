/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateRoomRequest } from '../models/CreateRoomRequest';
import type { ErrorResponse } from '../models/ErrorResponse';
import type { Room } from '../models/Room';
import type { RoomJoinResponse } from '../models/RoomJoinResponse';
import type { RoomParticipantsResponse } from '../models/RoomParticipantsResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class SignalingService {
    /**
     * Create a new signaling room
     * Create a new room that clients can join for WebRTC peer-to-peer calls.
     * @param requestBody
     * @returns ErrorResponse Unexpected server error
     * @returns Room Room successfully created
     * @throws ApiError
     */
    public static createRoom(
        requestBody: CreateRoomRequest,
    ): CancelablePromise<ErrorResponse | Room> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/rooms',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad Request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * List available rooms
     * @returns Room List of available rooms
     * @returns ErrorResponse Unexpected server error
     * @throws ApiError
     */
    public static listRooms(): CancelablePromise<Array<Room> | ErrorResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/rooms',
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Join a signaling room
     * Join an existing room. The WebSocket endpoint is used after joining.
     * @param roomId
     * @returns RoomJoinResponse Successfully joined room
     * @returns ErrorResponse Unexpected server error
     * @throws ApiError
     */
    public static joinRoom(
        roomId: string,
    ): CancelablePromise<RoomJoinResponse | ErrorResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/rooms/{roomId}/join',
            path: {
                'roomId': roomId,
            },
            errors: {
                401: `Unauthorized`,
                404: `Resource Not Found`,
            },
        });
    }
    /**
     * Get room participants
     * Get a list of all users currently connected to the room.
     * @param roomId
     * @returns RoomParticipantsResponse List of room participants
     * @returns ErrorResponse Unexpected server error
     * @throws ApiError
     */
    public static getRoomParticipants(
        roomId: string,
    ): CancelablePromise<RoomParticipantsResponse | ErrorResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/rooms/{roomId}/participants',
            path: {
                'roomId': roomId,
            },
            errors: {
                401: `Unauthorized`,
                404: `Resource Not Found`,
            },
        });
    }
    /**
     * WebSocket connection for signaling
     * Upgrade to a WebSocket connection for exchanging signaling messages
     * (`offer`, `answer`, `ice`, `join`, `leave`).
     * Authenticate via `token` query param (JWT).
     *
     * **Example message:**
     * ```json
     * {
         * "type": "offer",
         * "room": "room123",
         * "from": "clientA",
         * "to": "clientB",
         * "payload": { "sdp": "..." }
         * }
         * ```
         *
         * @param token
         * @returns void
         * @throws ApiError
         */
        public static signalingWebSocket(
            token: string,
        ): CancelablePromise<void> {
            return __request(OpenAPI, {
                method: 'GET',
                url: '/api/v1/ws',
                query: {
                    'token': token,
                },
            });
        }
    }
