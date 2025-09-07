<template>
  <div class="video-controls">
    <div class="control-group">
      <button
        class="control-btn danger"
        @click="$emit('disconnect')"
        :disabled="!isInCall"
        title="Leave Call"
      >
        <i class="fas fa-phone-slash"></i>
      </button>

      <button
        class="control-btn"
        :class="{ active: isAudioEnabled }"
        @click="$emit('toggle-audio')"
        title="Mute/Unmute"
      >
        <i
          :class="
            isAudioEnabled ? 'fas fa-microphone' : 'fas fa-microphone-slash'
          "
        ></i>
      </button>

      <button
        class="control-btn"
        :class="{ active: isVideoEnabled }"
        @click="$emit('toggle-video')"
        title="Camera On/Off"
      >
        <i :class="isVideoEnabled ? 'fas fa-video' : 'fas fa-video-slash'"></i>
      </button>

      <button class="control-btn" title="Screen Share">
        <i class="fas fa-desktop"></i>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  isInCall: boolean;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
}

interface Emits {
  (e: 'disconnect'): void;
  (e: 'toggle-audio'): void;
  (e: 'toggle-video'): void;
}

defineProps<Props>();
defineEmits<Emits>();
</script>

<style scoped>
.video-controls {
  padding: 16px;
  background: #2f3136;
  border-top: 1px solid #202225;
  display: flex;
  justify-content: center;
}

.control-group {
  display: flex;
  gap: 12px;
  background: #202225;
  padding: 12px 20px;
  border-radius: 24px;
}

.control-btn {
  background: #4f545c;
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  font-size: 16px;
}

.control-btn:hover:not(:disabled) {
  transform: scale(1.05);
  background: #5d6269;
}

.control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.control-btn.active {
  background: #5865f2;
}

.control-btn.danger {
  background: #ed4245;
}

.control-btn.danger:hover:not(:disabled) {
  background: #c03537;
}

@media (max-width: 768px) {
  .video-controls {
    padding: 12px;
  }

  .control-group {
    padding: 8px 16px;
  }

  .control-btn {
    width: 36px;
    height: 36px;
    font-size: 14px;
  }
}
</style>
