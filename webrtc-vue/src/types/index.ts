// User types
export interface User {
  id: number;
  username: string;
}

export interface AuthState {
  user: User | null;
  token: string;
  isAuthenticated: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  user?: User;
  message?: string;
}

export interface RegisterResponse {
  success: boolean;
  message?: string;
}

// Channel types
export type ChannelType = 'text' | 'voice';

export interface Channel {
  id: number;
  name: string;
  type: ChannelType;
  created_at?: string;
}

export interface ChannelsState {
  channels: Channel[];
  activeChannelId: number | null;
}

export interface CreateChannelData {
  name: string;
  type: ChannelType;
}

// Message types
export interface Message {
  id: number;
  channel_id: number;
  user_id: number;
  content: string;
  created_at?: string;
  username?: string;
}

export interface MessagesState {
  messages: Message[];
}

// WebRTC types
export interface Participant {
  userId: number;
  username: string;
}

export interface WebRTCState {
  participants: Participant[];
  isInCall: boolean;
  localStream: MediaStream | null;
  remoteStreams: Record<number, MediaStream>;
  peerConnections: Record<number, RTCPeerConnection>;
}

// WebSocket message types
export interface UserListMessage {
  type: 'user_list';
  users: Participant[];
  from?: number;
  to?: number;
}

export interface UserJoinedMessage {
  type: 'user_joined';
  user: Participant;
  from?: number;
  to?: number;
}

export interface UserLeftMessage {
  type: 'user_left';
  userId: number;
  from?: number;
  to?: number;
}

export interface ChannelCreatedMessage {
  type: 'channel_created';
  channel: Channel;
  from?: number;
  to?: number;
}

export interface ChannelDeletedMessage {
  type: 'channel_deleted';
  channelId: number;
  from?: number;
  to?: number;
}

export interface NewMessageMessage {
  type: 'new_message';
  message: Message;
  from?: number;
  to?: number;
}

export interface JoinCallMessage {
  type: 'join_call';
  userId: number;
  username: string;
  from?: number;
  to?: number;
}

export interface LeaveCallMessage {
  type: 'leave_call';
  userId: number;
  from?: number;
  to?: number;
}

export interface OfferMessage {
  type: 'offer';
  offer: RTCSessionDescriptionInit;
  from?: number;
  to?: number;
}

export interface AnswerMessage {
  type: 'answer';
  answer: RTCSessionDescriptionInit;
  from?: number;
  to?: number;
}

export interface CandidateMessage {
  type: 'candidate';
  candidate: RTCIceCandidateInit;
  from?: number;
  to?: number;
}

export type SignalMessage =
  | UserListMessage
  | UserJoinedMessage
  | UserLeftMessage
  | ChannelCreatedMessage
  | ChannelDeletedMessage
  | NewMessageMessage
  | JoinCallMessage
  | LeaveCallMessage
  | OfferMessage
  | AnswerMessage
  | CandidateMessage;
