<template>
  <div class="text-channel">
    <div class="messages-container">
      <MessageItem
        v-for="message in messages"
        :key="message.id"
        :message="message"
      />
    </div>

    <MessageInput @send="handleSendMessage" />
  </div>
</template>

<script setup lang="ts">
import { Message } from '../../types';
import MessageItem from '../messages/MessageItem.vue';
import MessageInput from '../messages/MessageInput.vue';

interface Props {
  messages: Message[];
}

interface Emits {
  (e: 'send-message', content: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const handleSendMessage = (content: string) => {
  emit('send-message', content);
};
</script>

<style scoped>
.text-channel {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #36393f;
}

@media (max-width: 768px) {
  .messages-container {
    padding: 12px;
  }
}
</style>
