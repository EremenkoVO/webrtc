# WebRTC Signaling Implementation Guide

This document describes the complete WebRTC signaling implementation for the Vue client that works with the Go server.

## Architecture Overview

The signaling system consists of three main parts:

1. **Signaling Store** (`src/stores/signalingStore.ts`) - Manages WebSocket connection and signaling messages
2. **WebRTC Composable** (`src/composible/useWebRTC.ts`) - Handles WebRTC peer connections and media streams
3. **UI Components** - Display and control video calls

## Signaling Protocol

The signaling protocol follows the Go server's message format:

```typescript
interface SignalingMessage {
  type: 'join' | 'joined' | 'peer-joined' | 'offer' | 'answer' | 'ice' | 'leave'
  room?: string
  from?: string
  to?: string
  payload?: any
}
```

### Message Flow

1. **Join Room**:
   ```
   Client -> Server: { type: 'join', room: 'room-id' }
   Server -> Client: { type: 'joined', from: 'client-id' }
   Server -> Others: { type: 'peer-joined', from: 'client-id' }
   ```

2. **WebRTC Negotiation**:
   ```
   Client A -> Server: { type: 'offer', to: 'client-b', payload: { sdp: '...' } }
   Server -> Client B: { type: 'offer', from: 'client-a', payload: { sdp: '...' } }
   Client B -> Server: { type: 'answer', to: 'client-a', payload: { sdp: '...' } }
   Server -> Client A: { type: 'answer', from: 'client-b', payload: { sdp: '...' } }
   ```

3. **ICE Candidates**:
   ```
   Client -> Server: { type: 'ice', to: 'peer-id', payload: { candidate: '...' } }
   Server -> Peer: { type: 'ice', from: 'client-id', payload: { candidate: '...' } }
   ```

4. **Leave Room**:
   ```
   Client -> Server: { type: 'leave', room: 'room-id' }
   Server -> Others: { type: 'leave', from: 'client-id' }
   ```

## Usage

### 1. Signaling Store

The signaling store manages the WebSocket connection:

```typescript
import { useSignalingStore } from '@/stores/signalingStore'

const signalingStore = useSignalingStore()

// Connect to signaling server
signalingStore.connect()

// Join a room
signalingStore.joinRoom('room-id')

// Send messages
signalingStore.sendOffer(peerId, sdp)
signalingStore.sendAnswer(peerId, sdp)
signalingStore.sendIceCandidate(peerId, candidate)

// Listen to messages
const unsubscribe = signalingStore.onMessage('offer', (message) => {
  console.log('Received offer:', message)
})

// Leave room
signalingStore.leaveRoom()

// Disconnect
signalingStore.disconnect()
```

### 2. WebRTC Composable

The WebRTC composable handles media streams and peer connections:

```typescript
import { useWebRTC } from '@/composible/useWebRTC'

const {
  localStream,
  remotePeers,
  isMediaInitialized,
  joinRoomWithMedia,
  leaveRoom,
  stopMedia
} = useWebRTC()

// Join room with media
await joinRoomWithMedia('room-id', {
  video: true,
  audio: true
})

// Access streams
console.log('Local stream:', localStream.value)
console.log('Remote peers:', remotePeers.value)

// Leave room
leaveRoom()
stopMedia()
```

### 3. Component Integration

See `src/components/ChannelComponent.vue` for a complete example of integrating the signaling and WebRTC systems in a Vue component.

Key features:
- Video grid displaying local and remote streams
- Call controls (mute/unmute audio/video, end call)
- Connection status indicator
- Automatic reconnection handling

## Features

### Automatic Reconnection

The signaling store automatically attempts to reconnect if the WebSocket connection is lost:
- Exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s)
- Maximum 5 reconnection attempts
- Automatically rejoins the room after reconnection

### Connection States

- `disconnected` - Not connected to signaling server
- `connecting` - Connecting to signaling server
- `connected` - Connected and ready
- `reconnecting` - Attempting to reconnect after disconnection

### Message Handlers

Register handlers for specific message types or all messages:

```typescript
// Specific message type
signalingStore.onMessage('offer', (message) => {
  // Handle offer
})

// All messages
signalingStore.onMessage('*', (message) => {
  console.log('Any message:', message)
})
```

## WebSocket Connection

The WebSocket connection is established to:
```
ws://localhost:8080/api/v1/ws
```

Authentication token (if available) is passed as a query parameter:
```
ws://localhost:8080/api/v1/ws?token=<jwt-token>
```

## ICE Configuration

Default STUN servers used for NAT traversal:
```typescript
{
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
}
```

For production use, consider adding TURN servers for better connectivity.

## Troubleshooting

### WebSocket Connection Issues

1. Check that the Go server is running
2. Verify the `OpenAPI.BASE` configuration in `src/api/core/OpenAPI.ts`
3. Check browser console for WebSocket errors
4. Ensure CORS is properly configured on the server

### Media Permission Issues

1. Browser must be served over HTTPS (or localhost)
2. User must grant camera/microphone permissions
3. Check browser's site settings if permissions are blocked

### Peer Connection Issues

1. Check browser console for ICE connection state
2. Verify STUN/TURN server configuration
3. Ensure both peers are in the same room
4. Check firewall settings that may block WebRTC

## Testing

To test the signaling system:

1. Start the Go server:
   ```bash
   cd ../goserver
   go run cmd/api/main.go
   ```

2. Start the Vue client:
   ```bash
   npm run dev
   ```

3. Open two browser windows
4. Login in both windows
5. Create a room in one window
6. Join the same room in both windows
7. Click "Начать звонок" (Start Call) in both windows
8. Verify video/audio streams are exchanged

## File Structure

```
src/
├── stores/
│   └── signalingStore.ts       # WebSocket connection & signaling messages
├── composible/
│   └── useWebRTC.ts            # WebRTC peer connections & media
├── components/
│   ├── ChannelComponent.vue    # Video call UI
│   └── SidebarComponent.vue    # Room list & join
├── api/
│   └── models/
│       └── SignalingMessage.ts # Type definitions
└── App.vue                     # App entry point with signaling init
```

## Future Enhancements

1. **Screen Sharing** - Add ability to share screen
2. **Chat Messages** - Text chat alongside video
3. **Recording** - Record video calls
4. **Picture-in-Picture** - Continue call in PiP mode
5. **Quality Settings** - Adjust video quality based on bandwidth
6. **TURN Server** - Add TURN server for better connectivity
7. **Stats Display** - Show connection quality metrics
