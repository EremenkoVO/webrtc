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

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  const token = authStore.token
  const refreshToken = authStore.refreshToken

  const requiresAuth = to.matched.some((record) => record.meta.requiredAuth)

  if (requiresAuth && !token && !refreshToken) {
    next({ name: 'Login' })
  } else if ((to.name === 'Login' || to.path.startsWith('/auth')) && (token || refreshToken)) {
    next({ name: 'Home' })
  } else {
    next()
  }
})

export default router
