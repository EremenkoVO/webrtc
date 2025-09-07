<template>
  <div class="video-grid">
    <!-- Local Video or Audio Only -->
    <div
      v-if="isInCall && (hasLocalStream || hasLocalAudioOnly)"
      class="participant local"
      :class="{ 'audio-only': isAudioOnly }"
    >
      <div class="video-container">
        <video
          v-if="!isAudioOnly && hasLocalVideo"
          ref="localVideo"
          autoplay
          playsinline
          muted
        ></video>
        <div v-else-if="isAudioOnly" class="audio-only-placeholder">
          <i class="fas fa-microphone"></i>
          <p>Audio only</p>
        </div>

        <div class="participant-overlay">
          <span class="username">{{ user?.username || 'You' }}</span>
          <div class="participant-controls">
            <button
              class="control-btn"
              :class="{ active: isAudioEnabled }"
              @click="toggleAudio"
              title="Mute/Unmute"
            >
              <i
                :class="
                  isAudioEnabled
                    ? 'fas fa-microphone'
                    : 'fas fa-microphone-slash'
                "
              ></i>
            </button>
            <button
              v-if="!isAudioOnly"
              class="control-btn"
              :class="{ active: isVideoEnabled }"
              @click="toggleVideo"
              title="Camera On/Off"
            >
              <i
                :class="isVideoEnabled ? 'fas fa-video' : 'fas fa-video-slash'"
              ></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Remote Participants -->
    <div
      v-for="participant in callParticipants"
      :key="participant.userId"
      class="participant"
      :class="{
        'audio-only': isParticipantAudioOnly(participant.userId),
        fullscreen: fullscreenUserId === participant.userId,
      }"
      @dblclick="handleToggleFullscreen(participant.userId)"
    >
      <div class="video-container">
        <video
          v-if="!isParticipantAudioOnly(participant.userId)"
          :ref="(el) => setRemoteVideoRef(el, participant.userId)"
          autoplay
          playsinline
        ></video>
        <div v-else class="audio-only-placeholder">
          <i class="fas fa-user"></i>
          <p>Audio only</p>
        </div>

        <div class="participant-overlay">
          <span class="username">{{ participant.username }}</span>
          <div class="participant-controls">
            <button class="control-btn" title="Volume">
              <i class="fas fa-volume-up"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty States -->
    <div
      v-if="
        callParticipants.length === 0 &&
        isInCall &&
        (hasLocalStream || hasLocalAudioOnly)
      "
      class="empty-state"
    >
      <div class="empty-icon">
        <i class="fas fa-user-friends"></i>
      </div>
      <h3>Waiting for participants...</h3>
      <p>Share this voice channel with others to start chatting</p>
    </div>

    <div v-if="!isInCall" class="not-in-call-state">
      <div class="empty-icon">
        <i class="fas fa-phone"></i>
      </div>
      <h3>Not in a call</h3>
      <p>Click "Join Voice" to start or join a voice call</p>
    </div>

    <div
      v-if="isInCall && !hasLocalStream && !hasLocalAudioOnly"
      class="loading-state"
    >
      <div class="empty-icon">
        <i class="fas fa-spinner fa-spin"></i>
      </div>
      <h3>Initializing call...</h3>
      <p>Setting up your connection</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMedia } from '../../composables/useMedia';
import { useAuthStore } from '../../stores/auth';
import { useMediaStore } from '../../stores/media';
import { useUsersStore } from '../../stores/users';

interface Props {
  isInCall?: boolean;
}

withDefaults(defineProps<Props>(), {
  isInCall: false,
});

interface Emits {
  (e: 'toggle-fullscreen', userId: number | null): void;
}

const emit = defineEmits<Emits>();

const authStore = useAuthStore();
const usersStore = useUsersStore();
const {
  fullscreenUserId,
  localStream,
  toggleAudio,
  toggleVideo,
  getRemoteStream,
} = useMedia();

const mediaStore = useMediaStore();
const isAudioEnabled = computed(() => mediaStore.isAudioEnabled);
const isVideoEnabled = computed(() => mediaStore.isVideoEnabled);

const localVideo = ref<HTMLVideoElement | null>(null);
const remoteVideoRefs = ref<Record<number, HTMLVideoElement | null>>({});

const user = computed(() => authStore.user);
const callParticipants = computed(() =>
  usersStore.callParticipants.filter((p) => p.userId !== authStore.user?.id),
);

const hasLocalStream = computed(() => {
  return localStream !== null;
});

const hasLocalAudioOnly = computed(() => {
  if (!localStream) return false;
  const tracks = localStream.getTracks();
  return tracks.length > 0 && tracks.every((track) => track.kind === 'audio');
});

const isAudioOnly = computed(() => {
  return hasLocalAudioOnly.value;
});

const hasLocalVideo = computed(() => {
  if (!localStream) return false;
  return localStream.getTracks().some((track) => track.kind === 'video');
});

const isParticipantAudioOnly = (userId: number): boolean => {
  const stream = getRemoteStream(userId);
  if (!stream) return true; // Если нет стрима, считаем аудио-только

  const tracks = stream.getTracks();
  return tracks.length === 0 || tracks.every((track) => track.kind === 'audio');
};

const setRemoteVideoRef = (el: Element | null, userId: number) => {
  if (el instanceof HTMLVideoElement) {
    remoteVideoRefs.value[userId] = el;
    const stream = getRemoteStream(userId);
    if (stream) {
      el.srcObject = stream;
      el.muted = false;
      el.play().catch((e) => console.error('Error playing remote video:', e));
    }
  }
};

const handleToggleFullscreen = (userId: number) => {
  emit('toggle-fullscreen', userId);
};

// Watch for local stream changes
import { watch } from 'vue';
watch(
  () => localStream,
  (newStream) => {
    if (localVideo.value && newStream) {
      localVideo.value.srcObject = newStream;
    }
  },
);
</script>

<style scoped>
.video-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  padding: 16px;
  overflow-y: auto;
  background: #2f3136;
}

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

.audio-only-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #4f545c;
  color: white;
}

.audio-only-placeholder i {
  font-size: 48px;
  margin-bottom: 16px;
}

.audio-only-placeholder p {
  margin: 0;
  font-size: 16px;
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

/* Fullscreen */
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

.empty-state,
.not-in-call-state,
.loading-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #b9bbbe;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 24px;
  color: #4f545c;
}

.empty-state h3,
.not-in-call-state h3,
.loading-state h3 {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
  color: #f2f3f5;
}

.empty-state p,
.not-in-call-state p,
.loading-state p {
  margin: 0;
  font-size: 16px;
}

@media (max-width: 768px) {
  .video-grid {
    grid-template-columns: 1fr;
    padding: 8px;
    gap: 12px;
  }

  .empty-state,
  .not-in-call-state,
  .loading-state {
    padding: 20px;
  }
}
</style>
