import type { Message } from '../types';
import { apiService } from './api';

export const messageService = {
  async getMessages(channelId: number) {
    try {
      const response = await apiService.get(`/messages/${channelId}`);
      return response.data.messages as Message[];
    } catch (error) {
      throw new Error('Failed to fetch messages');
    }
  },

  async sendMessage(channelId: number, content: string) {
    try {
      const response = await apiService.post('/messages', {
        channelId,
        content,
      });
      return response.data.message as Message;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.message || 'Failed to send message',
      );
    }
  },
};
