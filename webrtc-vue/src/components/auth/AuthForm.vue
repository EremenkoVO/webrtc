<template>
  <form @submit.prevent="onSubmit">
    <div class="form-group">
      <label for="username">Username</label>
      <div class="input-wrapper">
        <i class="fas fa-user"></i>
        <input
          id="username"
          v-model="form.username"
          type="text"
          placeholder="Enter your username"
          required
        />
      </div>
    </div>

    <div class="form-group">
      <label for="password">Password</label>
      <div class="input-wrapper">
        <i class="fas fa-lock"></i>
        <input
          id="password"
          v-model="form.password"
          type="password"
          placeholder="Enter your password"
          required
        />
      </div>
    </div>

    <button type="submit" class="submit-btn" :disabled="loading">
      <i v-if="loading" class="fas fa-spinner fa-spin"></i>
      {{ isLoginMode ? 'Sign In' : 'Sign Up' }}
    </button>
  </form>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';

interface Props {
  isLoginMode: boolean;
  loading: boolean;
}

interface Emits {
  (e: 'submit', credentials: { username: string; password: string }): void;
  (e: 'toggle-mode'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const form = reactive({
  username: '',
  password: '',
});

const onSubmit = () => {
  emit('submit', {
    username: form.username,
    password: form.password,
  });
};
</script>

<style scoped>
.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #b9bbbe;
}

.input-wrapper {
  position: relative;
}

.input-wrapper i {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #b9bbbe;
}

.input-wrapper input {
  width: 100%;
  padding: 12px 12px 12px 40px;
  background: #202225;
  border: 1px solid #202225;
  border-radius: 4px;
  color: white;
  font-size: 16px;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.input-wrapper input:focus {
  outline: none;
  border-color: #5865f2;
}

.submit-btn {
  width: 100%;
  padding: 12px;
  background: #5865f2;
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-sizing: border-box;
}

.submit-btn:hover:not(:disabled) {
  background: #4752c4;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
