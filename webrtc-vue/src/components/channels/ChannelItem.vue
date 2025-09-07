<template>
  <li
    class="channel-item"
    :class="{ active: isActive }"
    @click="$emit('select')"
  >
    <i
      :class="channel.type === 'text' ? 'fas fa-hashtag' : 'fas fa-microphone'"
    ></i>
    <span>{{ channel.name }}</span>
    <button
      v-if="channel.id > 2"
      @click.stop="$emit('delete')"
      class="delete-channel-btn"
      title="Delete Channel"
    >
      <i class="fas fa-trash"></i>
    </button>
  </li>
</template>

<script setup lang="ts">
import { Channel } from '../../types';

interface Props {
  channel: Channel;
  isActive: boolean;
}

interface Emits {
  (e: 'select'): void;
  (e: 'delete'): void;
}

defineProps<Props>();
defineEmits<Emits>();
</script>

<style scoped>
.channel-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px 8px 32px;
  margin: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  color: #b9bbbe;
  font-size: 16px;
}

.channel-item:hover {
  background: #34373c;
  color: #dcddde;
}

.channel-item.active {
  background: rgba(79, 84, 92, 0.32);
  color: #fff;
}

.channel-item i {
  font-size: 14px;
  width: 16px;
  text-align: center;
}

.delete-channel-btn {
  background: none;
  border: none;
  color: #b9bbbe;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.2s;
}

.channel-item:hover .delete-channel-btn {
  opacity: 1;
}

.delete-channel-btn:hover {
  color: #ed4245;
}
</style>
