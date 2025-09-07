import { Request } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import { WebSocket } from 'ws';

export interface UserRow {
  id: number;
  username: string;
  password: string;
  created_at?: string;
}

export interface UserPayload extends JwtPayload {
  id: number;
  username: string;
}

export interface Channel {
  id: number;
  name: string;
  type: 'text' | 'voice';
  created_at?: string;
}

export interface Message {
  id: number;
  channel_id: number;
  user_id: number;
  content: string;
  created_at?: string;
  username?: string;
}

export interface WSClient extends WebSocket {
  userId?: number;
  username?: string;
}

export interface CustomRequest extends Request {
  user?: UserPayload;
}

// WebSocket message types
export interface WebSocketMessage {
  type: string;
  from?: number;
  to?: number;
  [key: string]: any;
}

export interface JoinCallMessage extends WebSocketMessage {
  type: 'join_call';
  userId: number;
  username: string;
}

export interface LeaveCallMessage extends WebSocketMessage {
  type: 'leave_call';
  userId: number;
}

export interface WebRTCSignalMessage extends WebSocketMessage {
  type: 'webrtc_signal';
  signal: any;
}

export interface JoinChannelMessage extends WebSocketMessage {
  type: 'join_channel';
  channelId: number;
}

export interface LeaveChannelMessage extends WebSocketMessage {
  type: 'leave_channel';
  channelId: number;
}
