<template>
  <div class="auth-page">
    <AuthModal />
  </div>
</template>

<script setup lang="ts">
import AuthModal from '../components/auth/AuthModal.vue';
</script>

<style scoped>
.auth-page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  width: 100vw;
  background: #36393f;
}
</style>
