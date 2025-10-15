import './assets/base.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { OpenAPI } from './api'
import App from './App.vue'
import router from './router'

OpenAPI.BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
OpenAPI.TOKEN = localStorage.getItem('token') || ''

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
