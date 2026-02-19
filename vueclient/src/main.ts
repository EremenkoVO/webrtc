import './app/styles.css'

import { library } from '@fortawesome/fontawesome-svg-core'
import {
  faVolumeHigh, faMicrophone, faMicrophoneSlash,
  faVideo, faVideoSlash, faDesktop, faPhoneSlash,
  faXmark, faChevronDown, faChevronUp, faPlus,
  faBars, faHashtag, faPaperPlane, faUser,
  faRightFromBracket, faArrowsRotate, faComment,
  faWindowMaximize, faWindowRestore, faVolumeMute,
  faPlay, faPause, faVolumeLow, faGear, faCircleStop,
  faPencil, faTrash, faFaceSmile, faEye, faEyeSlash,
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
  faVolumeHigh, faMicrophone, faMicrophoneSlash,
  faVideo, faVideoSlash, faDesktop, faPhoneSlash,
  faXmark, faChevronDown, faChevronUp, faPlus,
  faBars, faHashtag, faPaperPlane, faUser,
  faRightFromBracket, faArrowsRotate, faComment,
  faWindowMaximize, faWindowRestore, faVolumeMute,
  faPlay, faPause, faVolumeLow, faGear, faCircleStop,
  faPencil, faTrash, faFaceSmile, faEye, faEyeSlash,
)

OpenAPI.TOKEN = localStorage.getItem('token') || ''

const app = createApp(App)

app.component('font-awesome-icon', FontAwesomeIcon)
app.use(createPinia())
app.use(i18n)
app.use(vClickOutside)
app.use(router)

app.mount('#app')
