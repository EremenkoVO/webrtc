import './assets/base.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import vClickOutside from 'click-outside-vue3'
import { OpenAPI } from './api'
import App from './App.vue'
import router from './router'

OpenAPI.TOKEN = localStorage.getItem('token') || ''

const app = createApp(App)

app.use(createPinia())
app.use(vClickOutside)
app.use(router)

app.mount('#app')
