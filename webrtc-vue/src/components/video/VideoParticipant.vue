<template>
  <div
    class="participant"
    :class="{
      local: isLocal,
      fullscreen: isFullscreen && !isLocal,
    }"
    @dblclick="!isLocal ? $emit('toggle-fullscreen') : null"
  >
    <div class="video-container">
      <video v-if="!isLocal" ref="remoteVideo" autoplay playsinline></video>
      <video v-else ref="localVideo" autoplay playsinline muted></video>

      <div class="participant-overlay">
        <span class="username">{{ username }}</span>
        <div class="participant-controls">
          <button
            v-if="isLocal"
            class="control-btn"
            :class="{ active: isAudioEnabled }"
            @click.stop="$emit('toggle-audio')"
            title="Mute/Unmute"
          >
            <i
              :class="
                isAudioEnabled ? 'fas fa-microphone' : 'fas fa-microphone-slash'
              "
            ></i>
          </button>
          <button
            v-if="isLocal"
            class="control-btn"
            :class="{ active: isVideoEnabled }"
            @click.stop="$emit('toggle-video')"
            title="Camera On/Off"
          >
            <i
              :class="isVideoEnabled ? 'fas fa-video' : 'fas fa-video-slash'"
            ></i>
          </button>
          <button v-if="!isLocal" class="control-btn" title="Volume">
            <i class="fas fa-volume-up"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useMedia } from '../../composables/useMedia';
import type { Participant } from '../../types';

interface Props {
  isLocal?: boolean;
  participant?: Participant;
  username?: string;
  isFullscreen?: boolean;
}

interface Emits {
  (e: 'toggle-fullscreen'): void;
  (e: 'toggle-audio'): void;
  (e: 'toggle-video'): void;
}

const props = withDefaults(defineProps<Props>(), {
  isLocal: false,
  isFullscreen: false,
  username: 'User',
});

const emit = defineEmits<Emits>();

const { isAudioEnabled, isVideoEnabled, getRemoteStream } = useMedia();

const localVideo = ref<HTMLVideoElement | null>(null);
const remoteVideo = ref<HTMLVideoElement | null>(null);

// Set local stream when it changes
watch(
  () => {
    const mediaStore = useMedia();
    return mediaStore.localStream;
  },
  (newStream) => {
    if (localVideo.value && newStream && props.isLocal) {
      console.log('Setting local stream to video element');
      localVideo.value.srcObject = newStream;
    }
  },
  { immediate: true },
);

// Set remote stream when participant changes
watch(
  () => {
    if (!props.isLocal && props.participant?.userId) {
      return getRemoteStream(props.participant.userId);
    }
    return null;
  },
  (stream) => {
    if (!props.isLocal && stream && remoteVideo.value) {
      console.log(
        'Setting remote stream to video element for user:',
        props.participant?.userId,
      );
      remoteVideo.value.srcObject = stream;
      // Включаем звук для удаленного видео
      remoteVideo.value.muted = false;
    }
  },
);

onMounted(() => {
  // Проверяем, есть ли уже стрим для remote видео
  if (!props.isLocal && props.participant?.userId && remoteVideo.value) {
    const stream = getRemoteStream(props.participant.userId);
    if (stream) {
      console.log(
        'Setting existing remote stream on mount for user:',
        props.participant.userId,
      );
      remoteVideo.value.srcObject = stream;
      remoteVideo.value.muted = false;
    }
  }
});
</script>

<style scoped>
.participant {
  background: #202225;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s, box-shadow 0.2s;
  position: relative;
}

.participant:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

.participant.local {
  order: -1;
}

.video-container {
  position: relative;
  width: 100%;
  padding-top: 75%; /* 4:3 aspect ratio */
}

.participant video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
}

.participant-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.username {
  font-weight: 500;
  font-size: 14px;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.participant-controls {
  display: flex;
  gap: 8px;
}

.control-btn {
  background: rgba(0, 0, 0, 0.5);
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.control-btn:hover {
  background: rgba(0, 0, 0, 0.7);
  transform: scale(1.1);
}

.control-btn.active {
  background: #5865f2;
}

.control-btn i {
  font-size: 14px;
}

/* Fullscreen - только для удаленных видео */
.participant.fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 1000;
  margin: 0;
  border-radius: 0;
}

.participant.fullscreen .video-container {
  padding-top: 0;
  height: 100%;
}

/* Защита от fullscreen для локального видео */
.participant.local.fullscreen {
  position: relative;
  top: auto;
  left: auto;
  width: auto;
  height: auto;
  z-index: auto;
  border-radius: 8px;
}

.participant.local.fullscreen .video-container {
  padding-top: 75%;
  height: auto;
}

@media (max-width: 768px) {
  .participant-overlay {
    padding: 12px;
  }

  .username {
    font-size: 12px;
  }

  .control-btn {
    width: 36px;
    height: 36px;
    font-size: 14px;
  }
}
</style>
