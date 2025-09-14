<template>
  <div class="auth-modal">
    <div class="auth-form">
      <div class="form-header">
        <h2>{{ isLoginMode ? 'Welcome back!' : 'Create an account' }}</h2>
        <p>
          {{ isLoginMode ? 'Sign in to your account' : 'Join our community' }}
        </p>
      </div>

      <AuthForm
        :is-login-mode="isLoginMode"
        :loading="loading"
        @submit="handleSubmit"
        @toggle-mode="isLoginMode = !isLoginMode"
      />

      <div class="form-footer">
        <p>
          {{
            isLoginMode ? "Don't have an account?" : 'Already have an account?'
          }}
          <button @click="isLoginMode = !isLoginMode" class="link-btn">
            {{ isLoginMode ? 'Sign Up' : 'Sign In' }}
          </button>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import AuthForm from './AuthForm.vue';

const authStore = useAuthStore();
const router = useRouter();
const isLoginMode = ref<boolean>(true);
const loading = ref<boolean>(false);

const handleSubmit = async (credentials: {
  username: string;
  password: string;
}) => {
  loading.value = true;

  try {
    if (isLoginMode.value) {
      const result = await authStore.login(credentials);
      if (result.success) {
        router.push('/');
      } else {
        alert(result.message || 'Login failed');
      }
    } else {
      const result = await authStore.register(credentials);
      if (result.success) {
        router.push('/');
      } else {
        alert(result.message || 'Registration failed');
      }
    }
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.auth-modal {
  background: #36393f;
  border-radius: 8px;
  padding: 32px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.form-header {
  text-align: center;
  margin-bottom: 24px;
}

.form-header h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
  color: white;
}

.form-header p {
  margin: 0;
  color: #b9bbbe;
  font-size: 14px;
}

.form-footer {
  text-align: center;
  margin-top: 24px;
  color: #b9bbbe;
  font-size: 14px;
}

.link-btn {
  background: none;
  border: none;
  color: #00aff4;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  padding: 0;
  margin: 0;
}

.link-btn:hover {
  text-decoration: underline;
}

@media (max-width: 768px) {
  .auth-modal {
    padding: 24px;
  }
}
</style>
