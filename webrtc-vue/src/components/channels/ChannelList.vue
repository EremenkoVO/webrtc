<template>
  <div class="channels-section">
    <div class="section-header">
      <i
        :class="channelType === 'text' ? 'fas fa-hashtag' : 'fas fa-microphone'"
      ></i>
      <h3>{{ channelType === 'text' ? 'Text Channels' : 'Voice Channels' }}</h3>
      <button
        @click="$emit('create-channel', channelType)"
        class="add-channel-btn"
        :title="`Create ${channelType} Channel`"
      >
        <i class="fas fa-plus"></i>
      </button>
    </div>
    <ul class="channels-list">
      <ChannelItem
        v-for="channel in channels"
        :key="channel.id"
        :channel="channel"
        :is-active="channel.id === activeChannelId"
        @select="$emit('select-channel', channel)"
        @delete="$emit('delete-channel', channel.id)"
      />
    </ul>
  </div>
</template>

<script setup lang="ts">
import { Channel, ChannelType } from '../../types';
import ChannelItem from './ChannelItem.vue';

interface Props {
  channels: Channel[];
  activeChannelId: number | null;
  channelType: ChannelType;
}

interface Emits {
  (e: 'select-channel', channel: Channel): void;
  (e: 'create-channel', type: ChannelType): void;
  (e: 'delete-channel', channelId: number): void;
}

defineProps<Props>();
defineEmits<Emits>();
</script>

<style scoped>
.channels-section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  color: #b9bbbe;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.add-channel-btn {
  background: none;
  border: none;
  color: #b9bbbe;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  margin-left: auto;
}

.add-channel-btn:hover {
  background: #36393f;
  color: #fff;
}

.channels-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
</style>
