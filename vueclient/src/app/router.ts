import { useAuthStore } from '@/shared/stores/authStore'
import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

const router = createRouter({
  history: isElectron
    ? createWebHashHistory(import.meta.env.BASE_URL)
    : createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/auth',
      meta: { requiredAuth: false },
      children: [
        {
          path: 'login/',
          name: 'Login',
          component: () => import('@/pages/auth/AuthPage.vue'),
        },
        {
          path: 'register/',
          name: 'Register',
          component: () => import('@/pages/auth/AuthPage.vue'),
        },
      ],
    },
    {
      path: '/',
      name: 'Home',
      component: () => import('@/pages/home/HomePage.vue'),
      meta: { requiredAuth: true },
    },
    {
      path: '/admin',
      name: 'Admin',
      component: () => import('@/pages/admin/AdminPage.vue'),
      meta: { requiredAuth: false },
    },
  ],
})

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  const token = authStore.token
  const refreshToken = authStore.refreshToken
  const requiresAuth = to.matched.some((record) => record.meta.requiredAuth)

  if (requiresAuth && !token && !refreshToken) {
    next({ name: 'Login' })
    return
  }

  if ((to.name === 'Login' || to.path.startsWith('/auth')) && (token || refreshToken)) {
    try {
      const { UserService } = await import('@/api')
      await UserService.getCurrentUser()
      next({ name: 'Home' })
    } catch (error) {
      console.error('Token invalid:', error)
      authStore.clearTokens()
      next()
    }
    return
  }

  if (requiresAuth && token) {
    try {
      const { UserService } = await import('@/api')
      await UserService.getCurrentUser()
      next()
    } catch (error) {
      console.error('Token invalid:', error)
      authStore.clearTokens()
      const { OpenAPI } = await import('@/api')
      OpenAPI.TOKEN = ''
      next({ name: 'Login' })
      return
    }
  } else {
    next()
  }
})

export default router
