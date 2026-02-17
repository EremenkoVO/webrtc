import './app/styles.css'

import { library } from '@fortawesome/fontawesome-svg-core'
import {
  faVolumeHigh, faMicrophone, faMicrophoneSlash,
  faVideo, faVideoSlash, faDesktop, faPhoneSlash,
  faXmark, faChevronDown, faChevronUp, faPlus,
  faBars, faHashtag, faPaperPlane, faUser,
  faRightFromBracket, faArrowsRotate, faComment,
  faWindowMaximize, faWindowRestore, faVolumeMute,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import vClickOutside from 'click-outside-vue3'
import { OpenAPI } from './api'
import App from './app/App.vue'
import router from './app/router'

library.add(
  faVolumeHigh, faMicrophone, faMicrophoneSlash,
  faVideo, faVideoSlash, faDesktop, faPhoneSlash,
  faXmark, faChevronDown, faChevronUp, faPlus,
  faBars, faHashtag, faPaperPlane, faUser,
  faRightFromBracket, faArrowsRotate, faComment,
  faWindowMaximize, faWindowRestore, faVolumeMute,
)

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000'
OpenAPI.BASE = apiBase
const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
if (token) OpenAPI.TOKEN = token

const app = createApp(App)

app.component('font-awesome-icon', FontAwesomeIcon)
app.use(createPinia())
app.use(vClickOutside)
app.use(router)

app.mount('#app')
