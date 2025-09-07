<template>
  <div class="sidebar-overlay" @click="$emit('close')"></div>
</template>

<script setup lang="ts">
interface Emits {
  (e: 'close'): void;
}

defineEmits<Emits>();
</script>

<style scoped>
.sidebar-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
}
</style>
