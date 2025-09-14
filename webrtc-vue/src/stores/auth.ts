import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { authService } from '../services/auth';
import type { LoginCredentials, RegisterCredentials, User } from '../types';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const token = ref<string>('');

  const isAuthenticated = computed<boolean>(
    () => !!user.value && !!token.value,
  );

  const checkAuth = async (): Promise<void> => {
    user.value = localStorage.getItem('user')
      ? JSON.parse(localStorage.getItem('user') as string)
      : null;
    token.value = localStorage.getItem('token') || '';

    if (user.value && token.value) {
      try {
        const response = (await authService.getCurrentUser()) as {
          loggedIn: boolean;
          user: User | null;
        };
        if (response.loggedIn && response.user) {
          user.value = response.user;
          token.value = token.value;
        } else {
          logout();
        }
      } catch (error) {
        logout();
      }
    }
  };

  const login = async (credentials: LoginCredentials): Promise<any> => {
    try {
      const response = await authService.login(credentials);
      if (response.success && response.user && response.token) {
        user.value = response.user;
        token.value = response.token;

        localStorage.setItem('user', JSON.stringify(response.user));
        localStorage.setItem('token', response.token);

        return response;
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const register = async (credentials: RegisterCredentials): Promise<any> => {
    try {
      const response = await authService.register(credentials);
      if (response.success && response.user && response.token) {
        user.value = response.user;
        token.value = response.token;

        localStorage.setItem('user', JSON.stringify(response.user));
        localStorage.setItem('token', response.token);

        return response;
      }
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  };

  const logout = (): void => {
    user.value = null;
    token.value = '';
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    location.reload();
  };

  return {
    user,
    token,
    isAuthenticated,
    login,
    register,
    logout,
    checkAuth,
  };
});
