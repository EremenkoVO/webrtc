<template>
  <div class="voice-channel">
    <VideoGrid :participants="participants" :is-in-call="isInCall" />

    <VideoControls
      :is-in-call="isInCall"
      @disconnect="handleDisconnect"
      @toggle-audio="handleToggleAudio"
      @toggle-video="handleToggleVideo"
    />
  </div>
</template>

<script setup lang="ts">
import { useMedia } from '../../composables/useMedia';
import type { Participant } from '../../types';
import VideoControls from '../video/VideoControls.vue';
import VideoGrid from '../video/VideoGrid.vue';

interface Props {
  participants: Participant[];
  isInCall?: boolean;
}

withDefaults(defineProps<Props>(), {
  isInCall: false,
});

interface Emits {
  (e: 'start-call'): void;
  (e: 'disconnect-call'): void;
  (e: 'toggle-audio'): void;
  (e: 'toggle-video'): void;
  (e: 'toggle-fullscreen', userId: number): void;
}

const emit = defineEmits<Emits>();

const { toggleAudio, toggleVideo, setFullscreenUser } = useMedia();

const handleDisconnect = async () => {
  console.log('VoiceChannel: Disconnect requested');
  emit('disconnect-call');
};

const handleToggleAudio = () => {
  console.log('VoiceChannel: Toggle audio');
  toggleAudio();
  emit('toggle-audio');
};

const handleToggleVideo = () => {
  console.log('VoiceChannel: Toggle video');
  toggleVideo();
  emit('toggle-video');
};

const handleToggleFullscreen = (userId: number) => {
  console.log('VoiceChannel: Toggle fullscreen for user', userId);
  setFullscreenUser(userId);
  emit('toggle-fullscreen', userId);
};
</script>

<style scoped>
.voice-channel {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #2f3136;
}

@media (max-width: 768px) {
  .voice-channel {
    height: calc(100vh - 50px);
  }
}
</style>
