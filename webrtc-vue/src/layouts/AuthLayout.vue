<template>
  <div class="auth-layout">
    <div class="auth-container">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.auth-layout {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  width: 100vw;
  background: #36393f;
}

.auth-container {
  width: 100%;
  max-width: 400px;
  padding: 0 16px;
}
</style>
