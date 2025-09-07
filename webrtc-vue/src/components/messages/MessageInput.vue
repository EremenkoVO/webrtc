<template>
  <div class="message-input">
    <input
      v-model="message"
      @keyup.enter="sendMessage"
      type="text"
      placeholder="Type a message..."
    />
    <button @click="sendMessage" class="send-btn">
      <i class="fas fa-paper-plane"></i>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface Emits {
  (e: 'send', content: string): void;
}

const emit = defineEmits<Emits>();
const message = ref<string>('');

const sendMessage = () => {
  if (!message.value.trim()) return;

  emit('send', message.value.trim());
  message.value = '';
};
</script>

<style scoped>
.message-input {
  padding: 16px;
  background: #36393f;
  border-top: 1px solid #202225;
  display: flex;
  gap: 12px;
}

.message-input input {
  flex: 1;
  padding: 12px 16px;
  background: #202225;
  border: 1px solid #202225;
  border-radius: 20px;
  color: white;
  font-size: 16px;
}

.message-input input:focus {
  outline: none;
  border-color: #5865f2;
}

.send-btn {
  background: #5865f2;
  border: none;
  border-radius: 50%;
  width: 44px;
  height: 44px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.send-btn:hover {
  background: #4752c4;
}

@media (max-width: 768px) {
  .message-input {
    padding: 12px;
  }

  .message-input input {
    padding: 12px;
  }

  .send-btn {
    width: 40px;
    height: 40px;
  }
}
</style>
