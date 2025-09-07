<template>
  <aside
    class="sidebar"
    :class="{ 'mobile-sidebar': isMobile, 'sidebar-open': showSidebar }"
  >
    <div class="sidebar-header">
      <div class="logo">
        <i class="fas fa-comment-alt"></i>
        <span v-if="!isMobile">MyDiscord</span>
      </div>
      <button
        v-if="isMobile"
        @click="$emit('toggle-sidebar')"
        class="close-sidebar-btn"
      >
        <i class="fas fa-times"></i>
      </button>
    </div>

    <div class="sidebar-content">
      <ChannelList
        :channels="textChannels"
        :active-channel-id="activeChannelId"
        channel-type="text"
        @select-channel="handleSelectChannel"
        @create-channel="$emit('open-create-channel')"
        @delete-channel="handleDeleteChannel"
      />

      <ChannelList
        :channels="voiceChannels"
        :active-channel-id="activeChannelId"
        channel-type="voice"
        @select-channel="handleSelectChannel"
        @create-channel="$emit('open-create-channel')"
        @delete-channel="handleDeleteChannel"
      />

      <UserList :participants="participants" />
    </div>

    <div class="sidebar-footer">
      <button @click="handleLogout" class="logout-btn">
        <i class="fas fa-sign-out-alt"></i>
        <span v-if="!isMobile">Logout</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useChannelsStore } from '../../stores/channels';
import { useUsersStore } from '../../stores/users';
import { Channel } from '../../types';
import ChannelList from '../channels/ChannelList.vue';
import UserList from '../users/UserList.vue';

interface Props {
  isMobile?: boolean;
  showSidebar?: boolean;
}

withDefaults(defineProps<Props>(), {
  isMobile: false,
  showSidebar: false,
});

interface Emits {
  (e: 'toggle-sidebar'): void;
  (e: 'select-channel', channelId: number): void;
  (e: 'open-create-channel'): void;
}

const emit = defineEmits<Emits>();

// Stores
const authStore = useAuthStore();
const channelsStore = useChannelsStore();
const usersStore = useUsersStore();

// Computed
const textChannels = computed(() => channelsStore.textChannels);
const voiceChannels = computed(() => channelsStore.voiceChannels);
const activeChannelId = computed(() => channelsStore.activeChannelId);
const participants = computed(() => usersStore.participants);

// Methods
const handleSelectChannel = (channel: Channel) => {
  emit('select-channel', channel.id);
};

const handleDeleteChannel = async (channelId: number) => {
  await channelsStore.deleteChannel(channelId);
};

const handleLogout = () => {
  authStore.logout();
};
</script>

<style scoped>
.sidebar {
  width: 240px;
  background: #2f3136;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #202225;
  overflow: hidden;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #202225;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
}

.close-sidebar-btn {
  background: none;
  border: none;
  color: #b9bbbe;
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.close-sidebar-btn:hover {
  background: #36393f;
  color: #fff;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid #202225;
}

.logout-btn {
  width: 100%;
  padding: 8px;
  background: #202225;
  border: none;
  border-radius: 4px;
  color: #b9bbbe;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  transition: background 0.2s, color 0.2s;
}

.logout-btn:hover {
  background: #36393f;
  color: #fff;
}

/* Mobile Sidebar */
@media (max-width: 768px) {
  .mobile-sidebar {
    position: fixed;
    top: 0;
    left: -100%;
    width: 80%;
    max-width: 300px;
    height: 100vh;
    z-index: 1000;
    transition: left 0.3s ease;
    box-shadow: 2px 0 10px rgba(0, 0, 0, 0.3);
  }

  .mobile-sidebar.sidebar-open {
    left: 0;
  }

  .logo span {
    display: none;
  }

  .sidebar-footer {
    padding: 12px 16px;
  }
}
</style>
