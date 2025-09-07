<template>
  <li class="user-item" :class="{ 'in-call': isInCall }">
    <div class="user-avatar">
      <i class="fas fa-user"></i>
      <div class="status online"></div>
      <div v-if="isInCall" class="call-indicator"></div>
    </div>
    <span>{{ user.username }}{{ isCurrentUser ? ' (You)' : '' }}</span>
    <div v-if="isInCall" class="call-badge">
      <i class="fas fa-phone"></i>
    </div>
  </li>
</template>

<script setup lang="ts">
import { Participant } from '../../types';

interface Props {
  user: Participant;
  isCurrentUser?: boolean;
  isInCall?: boolean;
}

withDefaults(defineProps<Props>(), {
  isCurrentUser: false,
  isInCall: false,
});
</script>

<style scoped>
.user-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px 8px 32px;
  margin: 2px 8px;
  border-radius: 4px;
  color: #b9bbbe;
  font-size: 16px;
  position: relative;
}

.user-item:hover {
  background: #34373c;
  color: #dcddde;
}

.user-item.in-call {
  color: #fff;
  background: rgba(59, 165, 93, 0.1);
}

.user-item.in-call:hover {
  background: rgba(59, 165, 93, 0.2);
}

.user-avatar {
  position: relative;
  width: 24px;
  height: 24px;
  background: #4f545c;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-avatar i {
  font-size: 12px;
  color: white;
}

.status {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid #2f3136;
}

.status.online {
  background: #3ba55d;
}

.call-indicator {
  position: absolute;
  top: 0;
  right: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3ba55d;
  border: 2px solid #2f3136;
}

.call-badge {
  margin-left: auto;
  color: #3ba55d;
  font-size: 12px;
}

.call-badge i {
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}
</style>
