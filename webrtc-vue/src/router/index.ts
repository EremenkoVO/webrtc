import { createRouter, createWebHistory } from 'vue-router';
import AuthPage from '../pages/AuthPage.vue';
import ChannelPage from '../pages/ChannelPage.vue';
import { useAuthStore } from '../stores/auth';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: ChannelPage,
    meta: { requiresAuth: true },
  },
  {
    path: '/auth',
    name: 'Auth',
    component: AuthPage,
    meta: { requiresGuest: true },
  },
  {
    path: '/channels/:id',
    name: 'Channel',
    component: ChannelPage,
    meta: { requiresAuth: true },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Navigation guards
router.beforeEach(async (to, _, next) => {
  const authStore = useAuthStore();
  await authStore.checkAuth();

  console.log(authStore.token, authStore.user, authStore.isAuthenticated);

  if (to.meta?.requiresAuth && !authStore.isAuthenticated) {
    next('/auth');
  } else if (to.meta?.requiresGuest && authStore.isAuthenticated) {
    next('/');
  } else {
    next();
  }
});

export default router;
