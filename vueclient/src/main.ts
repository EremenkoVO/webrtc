import './app/styles.css'

import { library } from '@fortawesome/fontawesome-svg-core'
import {
  faArrowLeft,
  faArrowsRotate,
  faBars,
  faBell,
  faCamera,
  faChartBar,
  faCheck,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faCircle,
  faCircleInfo,
  faCircleNotch,
  faCircleStop,
  faComment,
  faCrown,
  faDesktop,
  faDoorOpen,
  faDownload,
  faEye,
  faEyeSlash,
  faFaceSmile,
  faFile,
  faGear,
  faHardDrive,
  faHashtag,
  faHeadset,
  faLock,
  faMicrophone,
  faMicrophoneSlash,
  faPaperclip,
  faPaperPlane,
  faPause,
  faPencil,
  faPhoneSlash,
  faPlay,
  faPlus,
  faReply,
  faRightFromBracket,
  faRotate,
  faShieldHalved,
  faSpinner,
  faTrash,
  faUser,
  faUsers,
  faVideo,
  faVideoSlash,
  faVolumeHigh,
  faVolumeLow,
  faVolumeMute,
  faVolumeXmark,
  faWindowMaximize,
  faWindowRestore,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import vClickOutside from 'click-outside-vue3'
import { OpenAPI } from './api'
import App from './app/App.vue'
import router from './app/router'
import i18n from './shared/i18n'

library.add(
  faVolumeHigh,
  faMicrophone,
  faMicrophoneSlash,
  faVideo,
  faVideoSlash,
  faDesktop,
  faPhoneSlash,
  faXmark,
  faChevronDown,
  faChevronUp,
  faChevronLeft,
  faChevronRight,
  faPlus,
  faBars,
  faHashtag,
  faPaperPlane,
  faUser,
  faRightFromBracket,
  faArrowsRotate,
  faComment,
  faWindowMaximize,
  faWindowRestore,
  faVolumeMute,
  faPlay,
  faPause,
  faVolumeLow,
  faGear,
  faCircleStop,
  faPencil,
  faTrash,
  faFaceSmile,
  faEye,
  faEyeSlash,
  faHeadset,
  faBell,
  faLock,
  faCheck,
  faCamera,
  faShieldHalved,
  faChartBar,
  faUsers,
  faDoorOpen,
  faArrowLeft,
  faCrown,
  faCircleNotch,
  faCircleInfo,
  faCircle,
  faVolumeXmark,
  faReply,
  faPaperclip,
  faFile,
  faDownload,
  faSpinner,
  faHardDrive,
  faRotate,
)

// Use a resolver so the token is read from localStorage on every request,
// avoiding stale-token issues after setTokens() or clearTokens()
OpenAPI.TOKEN = async () => localStorage.getItem('token') ?? ''

// Server URL: Electron runtime > localStorage > VITE_SERVER_URL env > '' (relative, uses proxy in dev)
async function resolveServerUrl(): Promise<string> {
  if (window.electronAPI) {
    const ipcUrl = await window.electronAPI.getServerUrl()
    if (ipcUrl) return ipcUrl
  }
  const stored = localStorage.getItem('serverUrl')
  if (stored) return stored
  return import.meta.env.VITE_SERVER_URL ?? ''
}

const serverUrl = await resolveServerUrl()
if (serverUrl) {
  OpenAPI.BASE = serverUrl
  localStorage.setItem('serverUrl', serverUrl)
}

const app = createApp(App)

app.component('font-awesome-icon', FontAwesomeIcon)
app.use(createPinia())
app.use(i18n)
app.use(vClickOutside)
app.use(router)

app.mount('#app')
