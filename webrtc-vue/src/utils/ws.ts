import { useAuthStore } from '../stores/auth';
import { useMediaStore } from '../stores/media';
import { useUsersStore } from '../stores/users';
import type { SignalMessage } from '../types';

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private messageHandler: ((msg: SignalMessage) => void) | null = null;

  connect(userId: number, username: string, token: string): void {
    this.ws = new WebSocket(`wss://192.168.1.129:8080?token=${token}`);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const data: SignalMessage = JSON.parse(event.data.toString());
        if (this.messageHandler) {
          this.messageHandler(data);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  onMessage(handler: (msg: SignalMessage) => void): void {
    this.messageHandler = handler;
  }

  send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageHandler = null;
  }
}

// Composable for using WebSocket in components
export const useWebSocket = () => {
  const wsClient = new WebSocketClient();
  const authStore = useAuthStore();
  const usersStore = useUsersStore();
  const mediaStore = useMediaStore();

  const connect = (): void => {
    if (authStore.isAuthenticated && authStore.user) {
      wsClient.connect(
        authStore.user.id,
        authStore.user.username,
        authStore.token,
      );
      wsClient.onMessage(handleMessage);
    }
  };

  const startCall = async (): Promise<void> => {
    if (!authStore.isAuthenticated || !authStore.user) return;

    try {
      usersStore.setInCall(true);

      // Get local media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });

      mediaStore.setLocalStream(stream);

      // Connect WebSocket if not connected
      if (!wsClient) {
        connect();
      }
    } catch (error) {
      console.error('Failed to start call:', error);
      usersStore.setInCall(false);
      throw new Error('Failed to access camera/microphone');
    }
  };

  const handleMessage = (msg: SignalMessage): void => {
    // Handle system messages
    if (msg.type === 'user_list' && msg.users) {
      const filteredUsers = msg.users.filter(
        (user) => user.userId !== authStore.user?.id,
      );
      usersStore.setOnlineUsers(filteredUsers);
      return;
    }

    if (msg.type === 'user_joined' && msg.userId) {
      if (msg.userId !== authStore.user?.id) {
        usersStore.addOnlineUser({
          userId: msg.userId,
          username: msg.username ?? '',
        });
      }
      return;
    }

    if (msg.type === 'user_left' && msg.userId) {
      usersStore.removeOnlineUser(msg.userId);
      return;
    }

    // Handle WebRTC signals
    if (msg.from === authStore.user?.id) return;

    // Forward to media handling
    handleSignal(msg);
  };

  const handleSignal = (msg: SignalMessage): void => {
    // This would be implemented based on your WebRTC logic
    console.log('Signal received:', msg);
  };

  const send = (message: any): void => {
    wsClient.send(message);
  };

  const disconnectCall = (): void => {
    wsClient.disconnect();
    usersStore.clearCallParticipants();
    mediaStore.clearStreams();
    usersStore.setInCall(false);
  };

  return {
    connect,
    startCall,
    send,
    disconnectCall,
    handleSignal,
  };
};
