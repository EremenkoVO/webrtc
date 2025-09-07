import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { channelService } from '../services/channels';
import type { Channel, CreateChannelData } from '../types';

export const useChannelsStore = defineStore('channels', () => {
  const channels = ref<Channel[]>([]);
  const activeChannelId = ref<number | null>(null);
  const loading = ref<boolean>(false);

  const textChannels = computed<Channel[]>(() =>
    channels.value.filter((channel) => channel.type === 'text'),
  );

  const voiceChannels = computed<Channel[]>(() =>
    channels.value.filter((channel) => channel.type === 'voice'),
  );

  const activeChannel = computed<Channel | undefined>(() =>
    channels.value.find((channel) => channel.id === activeChannelId.value),
  );

  const loadChannels = async (): Promise<void> => {
    if (loading.value) return;

    loading.value = true;
    try {
      const fetchedChannels = await channelService.getAllChannels();
      channels.value = fetchedChannels;

      // Set first channel as active if none selected
      if (!activeChannelId.value && fetchedChannels.length > 0) {
        activeChannelId.value = fetchedChannels[0].id;
      }
    } catch (error) {
      console.error('Failed to load channels:', error);
    } finally {
      loading.value = false;
    }
  };

  const setActiveChannel = (channelId: number): void => {
    activeChannelId.value = channelId;
  };

  const createChannel = async (
    channelData: CreateChannelData,
  ): Promise<Channel | null> => {
    try {
      const newChannel = await channelService.createChannel(channelData);
      channels.value.push(newChannel);
      return newChannel;
    } catch (error) {
      console.error('Failed to create channel:', error);
      return null;
    }
  };

  const deleteChannel = async (channelId: number): Promise<boolean> => {
    if (channelId <= 2) return false; // Protect default channels

    try {
      await channelService.deleteChannel(channelId);
      channels.value = channels.value.filter(
        (channel) => channel.id !== channelId,
      );

      if (activeChannelId.value === channelId) {
        activeChannelId.value = channels.value[0]?.id || null;
      }

      return true;
    } catch (error) {
      console.error('Failed to delete channel:', error);
      return false;
    }
  };

  return {
    channels,
    activeChannelId,
    textChannels,
    voiceChannels,
    activeChannel,
    loading,
    loadChannels,
    setActiveChannel,
    createChannel,
    deleteChannel,
  };
});
