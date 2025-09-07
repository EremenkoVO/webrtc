<template>
  <div class="mobile-header">
    <button @click="$emit('toggle-sidebar')" class="menu-btn">
      <i class="fas fa-bars"></i>
    </button>
    <div v-if="activeChannel" class="channel-info">
      <i
        :class="
          activeChannel.type === 'text' ? 'fas fa-hashtag' : 'fas fa-microphone'
        "
      ></i>
      <span>{{ activeChannel.name }}</span>
    </div>
    <div class="header-actions">
      <button
        v-if="activeChannel?.type === 'voice' && !isInCall"
        class="join-voice-mobile"
        @click="handleJoinVoice"
      >
        <i class="fas fa-phone"></i>
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { Channel } from '../../types';

interface Props {
  activeChannel?: Channel;
  isInCall?: boolean;
}

withDefaults(defineProps<Props>(), {
  activeChannel: undefined,
  isInCall: false,
});

interface Emits {
  (e: 'toggle-sidebar'): void;
  (e: 'join-voice'): void;
}

defineEmits<Emits>();

const handleJoinVoice = () => {
  emit('join-voice');
};
</script>

<style scoped>
.mobile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #36393f;
  border-bottom: 1px solid #202225;
  height: 50px;
  flex-shrink: 0;
}

.menu-btn {
  background: none;
  border: none;
  color: #b9bbbe;
  font-size: 20px;
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
}

.menu-btn:hover {
  background: #4f545c;
  color: #fff;
}

.channel-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 16px;
  flex: 1;
  justify-content: center;
  color: white;
}

.header-actions {
  width: 44px;
}

.join-voice-mobile {
  background: #3ba55d;
  border: none;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.join-voice-mobile:hover {
  background: #2d8c4c;
}
</style>
