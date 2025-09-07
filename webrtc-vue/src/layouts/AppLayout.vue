<template>
  <div class="app-layout">
    <slot name="sidebar"></slot>

    <div class="main-content-wrapper">
      <slot name="content"></slot>
    </div>

    <MobileHeader
      v-if="isMobile && authStore.isAuthenticated"
      :active-channel="activeChannel"
      :is-in-call="isInCall"
      @toggle-sidebar="$emit('toggle-sidebar')"
      @join-voice="handleJoinVoice"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useChannelsStore } from '../stores/channels';
import { useUsersStore } from '../stores/users';
import MobileHeader from '../components/layout/MobileHeader.vue';

// Stores
const authStore = useAuthStore();
const channelsStore = useChannelsStore();
const usersStore = useUsersStore();

// Props
interface Props {
  isMobile?: boolean;
}

withDefaults(defineProps<Props>(), {
  isMobile: false,
});

// Emits
interface Emits {
  (e: 'toggle-sidebar'): void;
  (e: 'join-voice'): void;
}

const emit = defineEmits<Emits>();

// State
const isMobileLocal = ref<boolean>(false);

// Computed
const activeChannel = computed(() => channelsStore.activeChannel);
const isInCall = computed(() => usersStore.isInCall);

// Methods
const checkMobile = (): void => {
  isMobileLocal.value = window.innerWidth <= 768;
};

const handleResize = (): void => {
  checkMobile();
};

const handleJoinVoice = (): void => {
  // Handle join voice call
  console.log('Join voice call');
};

// Lifecycle
onMounted(() => {
  checkMobile();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
}

.main-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}

@media (max-width: 768px) {
  .app-layout {
    flex-direction: column;
  }
}
</style>
