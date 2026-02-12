import { useAuthStore } from '@/stores/authStore'
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/auth',
      meta: {
        requiredAuth: false,
      },
      children: [
        {
          path: 'login/',
          name: 'Login',
          component: () => import('../views/Identity/AuthPage.vue'),
        },
        {
          path: 'register/',
          name: 'Register',
          component: () => import('../views/Identity/RegisterPage.vue'),
        },
      ],
    },
    {
      path: '/',
      name: 'Home',
      component: () => import('../views/HomeView.vue'),
      meta: {
        requiredAuth: true,
      },
    },
  ],
})

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  const token = authStore.token
  const refreshToken = authStore.refreshToken

  const requiresAuth = to.matched.some((record) => record.meta.requiredAuth)

  // Если требуется авторизация, но токенов нет - редирект на логин
  if (requiresAuth && !token && !refreshToken) {
    next({ name: 'Login' })
    return
  }

  // Если есть токены и пользователь пытается зайти на страницу авторизации - редирект на главную
  if ((to.name === 'Login' || to.path.startsWith('/auth')) && (token || refreshToken)) {
    // Проверяем валидность токена перед редиректом
    try {
      const { UserService } = await import('@/api')
      await UserService.getCurrentUser()
      next({ name: 'Home' })
    } catch (error) {
      // Если токен невалиден - очищаем и разрешаем доступ к странице авторизации
      console.error('Токен невалиден:', error)
      authStore.clearTokens()
      next()
    }
    return
  }

  // Если требуется авторизация и есть токен - проверяем его валидность
  if (requiresAuth && token) {
    try {
      // Проверяем валидность токена через API
      const { UserService } = await import('@/api')
      await UserService.getCurrentUser()
      next()
    } catch (error) {
      // Если токен невалиден - очищаем и редиректим на логин
      console.error('Токен невалиден:', error)
      authStore.clearTokens()
      // Очищаем OpenAPI токен
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
