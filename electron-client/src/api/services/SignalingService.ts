import type { CreateRoomRequest } from '../models/CreateRoomRequest'
import type { ErrorResponse } from '../models/ErrorResponse'
import type { Room } from '../models/Room'
import type { RoomJoinResponse } from '../models/RoomJoinResponse'
import type { RoomParticipantsResponse } from '../models/RoomParticipantsResponse'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'

export const SignalingService = {
  createRoom(requestBody: CreateRoomRequest): CancelablePromise<ErrorResponse | Room> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/api/v1/rooms',
      body: requestBody,
      mediaType: 'application/json',
      errors: { 400: 'Bad Request', 401: 'Unauthorized' },
    })
  },
  listRooms(): CancelablePromise<Room[] | ErrorResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/api/v1/rooms',
      errors: { 401: 'Unauthorized' },
    })
  },
  joinRoom(roomId: string): CancelablePromise<RoomJoinResponse | ErrorResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/api/v1/rooms/{roomId}/join',
      path: { roomId },
      errors: { 401: 'Unauthorized', 404: 'Not Found' },
    })
  },
  getRoomParticipants(roomId: string): CancelablePromise<RoomParticipantsResponse | ErrorResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/api/v1/rooms/{roomId}/participants',
      path: { roomId },
      errors: { 401: 'Unauthorized', 404: 'Not Found' },
    })
  },
}
