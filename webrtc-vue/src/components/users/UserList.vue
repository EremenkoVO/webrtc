<template>
  <div class="users-section">
    <div class="section-header">
      <i class="fas fa-users"></i>
      <h3>Online Users ({{ onlineUsers.length + 1 }})</h3>
    </div>
    <ul class="users-list">
      <UserItem
        :user="currentUser"
        :is-current-user="true"
        :is-in-call="isCurrentUserInCall"
      />
      <UserItem
        v-for="user in onlineUsers"
        :key="user.userId"
        :user="user"
        :is-in-call="isUserInCall(user.userId)"
      />
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useUsersStore } from '../../stores/users';
import { Participant } from '../../types';
import UserItem from './UserItem.vue';

interface Props {
  participants?: Participant[]; // Для совместимости
}

withDefaults(defineProps<Props>(), {
  participants: () => [],
});

const authStore = useAuthStore();
const usersStore = useUsersStore();

const currentUser = computed(() => ({
  userId: authStore.user?.id || 0,
  username: authStore.user?.username || 'You',
}));

const onlineUsers = computed(() => usersStore.onlineUsers);

const isCurrentUserInCall = computed(() => usersStore.isInCall);

const isUserInCall = (userId: number): boolean => {
  return usersStore.callParticipants.some((p) => p.userId === userId);
};
</script>

<style scoped>
.users-section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  color: #b9bbbe;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.users-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
</style>
