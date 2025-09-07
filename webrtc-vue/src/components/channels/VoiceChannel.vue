<template>
  <div class="voice-channel">
    <VideoGrid
      :participants="participants || []"
      :is-in-call="isInCall"
      @toggle-fullscreen="handleToggleFullscreen"
    />

    <VideoControls
      :is-in-call="isInCall"
      :is-audio-enabled="isAudioEnabled"
      :is-video-enabled="isVideoEnabled"
      @disconnect="handleDisconnect"
      @toggle-audio="handleToggleAudio"
      @toggle-video="handleToggleVideo"
    />
  </div>
</template>

<script setup lang="ts">
import { useMedia } from '../../composables/useMedia';
import type { Participant } from '../../types';
import VideoGrid from '../video/VideoGrid.vue';
import VideoControls from '../video/VideoControls.vue';

interface Props {
  participants?: Participant[];
  isInCall?: boolean;
}

withDefaults(defineProps<Props>(), {
  participants: () => [],
  isInCall: false,
});

interface Emits {
  (e: 'start-call'): void;
  (e: 'disconnect-call'): void;
  (e: 'toggle-audio'): void;
  (e: 'toggle-video'): void;
  (e: 'toggle-fullscreen', userId: number | null): void;
}

const emit = defineEmits<Emits>();

const {
  isAudioEnabled,
  isVideoEnabled,
  toggleAudio,
  toggleVideo,
  setFullscreenUser,
} = useMedia();

const handleDisconnect = () => {
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

const handleToggleFullscreen = (userId: number | null) => {
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
