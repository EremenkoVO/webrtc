<template>
  <div class="channel-header">
    <div class="channel-info">
      <i
        :class="
          channel.type === 'text' ? 'fas fa-hashtag' : 'fas fa-microphone'
        "
      ></i>
      <h2>{{ channel.name }}</h2>
    </div>
    <div class="channel-actions">
      <button
        v-if="channel.type === 'voice'"
        class="join-voice-btn"
        @click="$emit('join-voice')"
        :disabled="isInCall"
      >
        <i class="fas fa-phone"></i>
        Join Voice
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Channel } from '../../types';

interface Props {
  channel: Channel;
  isInCall?: boolean;
}

withDefaults(defineProps<Props>(), {
  isInCall: false,
});

interface Emits {
  (e: 'join-voice'): void;
}

defineEmits<Emits>();
</script>

<style scoped>
.channel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #202225;
  background: #36393f;
}

.channel-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: white;
}

.join-voice-btn {
  padding: 8px 16px;
  background: #3ba55d;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  transition: background 0.2s;
}

.join-voice-btn:hover:not(:disabled) {
  background: #2d8c4c;
}

.join-voice-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
