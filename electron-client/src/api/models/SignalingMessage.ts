export type SignalingMessage = {
  type: string
  room?: string
  from?: string
  username?: string
  to?: string
  payload?: {
    roomId?: string
    room_mates?: Record<string, string>
    sdp?: string
    type?: string
    candidate?: string
    sdpMid?: string
    sdpMLineIndex?: number
  }
}
export const SignalingMessageType = {
  JOIN: 'join',
  JOINED: 'joined',
  PEER_JOINED: 'peer-joined',
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE: 'ice',
  LEAVE: 'leave',
} as const
