<template>
  <div class="video-grid">
    <!-- Local Video -->
    <VideoParticipant
      v-if="isInCall && localStream"
      :is-local="true"
      :username="user?.username || 'You'"
      :is-fullscreen="false"
      @toggle-fullscreen="() => {}"
    />

    <!-- Remote Videos -->
    <VideoParticipant
      v-for="participant in callParticipants"
      :key="participant.userId"
      :participant="participant"
      :username="participant.username"
      :is-fullscreen="fullscreenUserId === participant.userId"
      @toggle-fullscreen="handleToggleFullscreen(participant.userId)"
    />

    <!-- Empty State -->
    <div
      v-if="callParticipants.length === 0 && isInCall && localStream"
      class="empty-state"
    >
      <div class="empty-icon">
        <i class="fas fa-user-friends"></i>
      </div>
      <h3>Waiting for participants...</h3>
      <p>Share this voice channel with others to start chatting</p>
    </div>

    <!-- Not in call state -->
    <div v-if="!isInCall" class="not-in-call-state">
      <div class="empty-icon">
        <i class="fas fa-phone"></i>
      </div>
      <h3>Not in a call</h3>
      <p>Click "Join Voice" to start or join a voice call</p>
    </div>

    <!-- No local stream -->
    <div v-if="isInCall && !localStream" class="loading-state">
      <div class="empty-icon">
        <i class="fas fa-spinner fa-spin"></i>
      </div>
      <h3>Initializing call...</h3>
      <p>Setting up your audio/video connection</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useMedia } from '../../composables/useMedia';
import { useAuthStore } from '../../stores/auth';
import { useUsersStore } from '../../stores/users';
import VideoParticipant from './VideoParticipant.vue';

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
const { fullscreenUserId, localStream } = useMedia();

const user = computed(() => authStore.user);
const callParticipants = computed(() =>
  usersStore.callParticipants.filter((p) => p.userId !== authStore.user?.id),
);

const handleToggleFullscreen = (userId: number | null) => {
  emit('toggle-fullscreen', userId);
};
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
