<template>
  <div class="message">
    <div class="message-avatar">
      <i class="fas fa-user"></i>
    </div>
    <div class="message-content">
      <div class="message-header">
        <span class="message-author">{{
          message.username || message.author
        }}</span>
        <span class="message-time">{{ formatTime(message.created_at) }}</span>
      </div>
      <div class="message-text">{{ message.content }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Message } from '../../types';

interface Props {
  message: Message;
}

const props = defineProps<Props>();

const formatTime = (dateString?: string): string => {
  if (!dateString) return '';

  try {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (error) {
    return '';
  }
};
</script>

<style scoped>
.message {
  display: flex;
  gap: 12px;
}

.message-avatar {
  width: 40px;
  height: 40px;
  background: #4f545c;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.message-avatar i {
  font-size: 20px;
  color: white;
}

.message-content {
  flex: 1;
}

.message-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}

.message-author {
  font-weight: 500;
  font-size: 16px;
  color: white;
}

.message-time {
  color: #b9bbbe;
  font-size: 12px;
}

.message-text {
  font-size: 16px;
  line-height: 1.3;
  color: white;
}

@media (max-width: 768px) {
  .message {
    gap: 8px;
  }

  .message-avatar {
    width: 32px;
    height: 32px;
  }

  .message-avatar i {
    font-size: 16px;
  }

  .message-author {
    font-size: 14px;
  }

  .message-text {
    font-size: 14px;
  }
}
</style>
