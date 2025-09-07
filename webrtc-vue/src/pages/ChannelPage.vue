<template>
  <AppLayout>
    <template #sidebar>
      <Sidebar
        :is-mobile="isMobile"
        :show-sidebar="showSidebar"
        @toggle-sidebar="toggleSidebar"
        @select-channel="handleSelectChannel"
        @open-create-channel="handleOpenCreateChannel"
      />
    </template>

    <template #content>
      <div class="channel-page">
        <ChannelHeader
          v-if="activeChannel"
          :channel="activeChannel"
          :is-in-call="isInCall"
          @join-voice="handleStartCall"
        />

        <TextChannel
          v-if="activeChannel?.type === 'text'"
          :messages="messages"
          @send-message="handleSendMessage"
        />

        <VoiceChannel
          v-else-if="activeChannel?.type === 'voice'"
          :participants="participants"
          :is-in-call="isInCall"
          @start-call="handleStartCall"
          @disconnect-call="handleDisconnectCall"
        />

        <div v-else class="no-channel">
          <div class="empty-icon">
            <i class="fas fa-hashtag"></i>
          </div>
          <h3>Welcome to MyDiscord!</h3>
          <p>Select a channel to start chatting</p>
        </div>
      </div>
    </template>
  </AppLayout>

  <CreateChannelModal
    v-if="showCreateChannelModal"
    @close="showCreateChannelModal = false"
    @create="handleCreateChannel"
  />

  <SidebarOverlay v-if="isMobile && showSidebar" @close="toggleSidebar" />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import ChannelHeader from '../components/channels/ChannelHeader.vue';
import CreateChannelModal from '../components/channels/CreateChannelModal.vue';
import TextChannel from '../components/channels/TextChannel.vue';
import VoiceChannel from '../components/channels/VoiceChannel.vue';
import Sidebar from '../components/layout/Sidebar.vue';
import SidebarOverlay from '../components/layout/SidebarOverlay.vue';
import { useWebSocket } from '../composables/useWebSocket';
import AppLayout from '../layouts/AppLayout.vue';
import { useAuthStore } from '../stores/auth';
import { useChannelsStore } from '../stores/channels';
import { useMessagesStore } from '../stores/messages';
import { useUsersStore } from '../stores/users';

// Stores
const authStore = useAuthStore();
const channelsStore = useChannelsStore();
const messagesStore = useMessagesStore();
const usersStore = useUsersStore();

// Composables
const { connect, startCall, disconnectCall } = useWebSocket();

// State
const isMobile = ref<boolean>(false);
const showSidebar = ref<boolean>(false);
const showCreateChannelModal = ref<boolean>(false);

// Computed
const activeChannel = computed(() => channelsStore.activeChannel);
const participants = computed(() => usersStore.callParticipants || []);
const isInCall = computed(() => usersStore.isInCall);
const messages = computed(() => messagesStore.messages);

// Methods
const checkMobile = (): void => {
  isMobile.value = window.innerWidth <= 768;
};

const handleResize = (): void => {
  checkMobile();
  if (!isMobile.value) {
    showSidebar.value = false;
  }
};

const toggleSidebar = (): void => {
  showSidebar.value = !showSidebar.value;
};

const handleSelectChannel = (channelId: number): void => {
  channelsStore.setActiveChannel(channelId);
  if (isMobile.value) {
    showSidebar.value = false;
  }
  if (isInCall.value) {
    disconnectCall();
  }
};

const handleOpenCreateChannel = (): void => {
  showCreateChannelModal.value = true;
};

const handleCreateChannel = async (CreateChannelData): Promise<void> => {
  await channelsStore.createChannel(data);
  showCreateChannelModal.value = false;
};

const handleStartCall = async (): Promise<void> => {
  try {
    console.log('Attempting to start call...');
    await startCall();
    console.log('Call started successfully');
  } catch (error: any) {
    console.error('Failed to start call:', error);
    alert(error.message || 'Failed to start call');
  }
};

const handleDisconnectCall = (): void => {
  disconnectCall();
};

const handleSendMessage = async (content: string): Promise<void> => {
  if (activeChannel.value) {
    await messagesStore.sendMessage(activeChannel.value.id, content);
  }
};

// Watch for active channel changes
watch(
  () => channelsStore.activeChannelId,
  async (newChannelId) => {
    if (newChannelId && activeChannel.value?.type === 'text') {
      messagesStore.clearMessages();
      await messagesStore.loadMessages(newChannelId);
    }
  },
);

// Lifecycle
onMounted(() => {
  checkMobile();
  window.addEventListener('resize', handleResize);

  // Initialize data
  channelsStore.loadChannels();
  connect();
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  disconnectCall();
});
</script>

<style scoped>
.channel-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.no-channel {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #b9bbbe;
  text-align: center;
  background: #2f3136;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 24px;
  color: #4f545c;
}

.no-channel h3 {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
  color: #f2f3f5;
}

.no-channel p {
  margin: 0;
  font-size: 16px;
}

/* Убедимся, что голосовой чат не занимает весь экран */
.voice-channel {
  flex: 1;
  height: 100%;
}
</style>
