import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';

const HOST = '185.31.166.30';
const PORT = 8080;

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: `http://${HOST}:${PORT}/api`,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.api.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const authStore = useAuthStore();
        if (authStore.token) {
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${authStore.token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      },
    );

    // Response interceptor
    this.api.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        if (error.response?.status === 401) {
          const authStore = useAuthStore();
          authStore.logout();
        }
        return Promise.reject(error);
      },
    );
  }

  public get<T>(url: string, config?: InternalAxiosRequestConfig) {
    return this.api.get<T>(url, config);
  }

  public post<T>(url: string, data?: any, config?: InternalAxiosRequestConfig) {
    return this.api.post<T>(url, data, config);
  }

  public put<T>(url: string, data?: any, config?: InternalAxiosRequestConfig) {
    return this.api.put<T>(url, data, config);
  }

  public delete<T>(url: string, config?: InternalAxiosRequestConfig) {
    return this.api.delete<T>(url, config);
  }
}

export const apiService = new ApiService();
