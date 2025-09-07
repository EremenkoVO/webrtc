import type { Channel, CreateChannelData } from '../types';
import { apiService } from './api';

export const channelService = {
  async getAllChannels() {
    try {
      const response = await apiService.get('/channels');
      const data = response.data as { channels: Channel[] };
      return data.channels;
    } catch (error) {
      throw new Error('Failed to fetch channels');
    }
  },

  async createChannel(data: CreateChannelData) {
    try {
      const response = await apiService.post('/channels', data);
      const responseData = response.data as { channel: Channel };
      return responseData.channel;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.message || 'Failed to create channel',
      );
    }
  },

  async deleteChannel(channelId: number) {
    try {
      await apiService.delete(`/channels/${channelId}`);
      return true;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.message || 'Failed to delete channel',
      );
    }
  },
};
