import type { SignalMessage } from '../types';

export class WebSocketService {
  private ws: WebSocket | null = null;
  private messageHandler: ((msg: SignalMessage) => void) | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;

  connect(userId: number, username: string, token: string): void {
    this.ws = new WebSocket(`wss://192.168.1.129:8080?token=${token}`);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
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
      this.reconnect(userId, username, token);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private reconnect(userId: number, username: string, token: string): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
        this.connect(userId, username, token);
      }, this.reconnectDelay * this.reconnectAttempts);
    }
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
