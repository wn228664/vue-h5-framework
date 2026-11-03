import { createRouter, createWebHistory } from 'vue-router'
import { showFailToast } from 'vant'
import { pinia } from '../stores/index.js'
import { useSessionStore } from '../stores/session.js'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('../layouts/TabLayout.vue'),
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('../views/home/index.vue'),
          meta: { title: '首页', keepAlive: true }
        },
        {
          path: 'components',
          name: 'components',
          component: () => import('../views/components/index.vue'),
          meta: { title: '通用组件', keepAlive: true }
        }
      ]
    },
    {
      path: '/forbidden',
      component: () => import('../views/forbidden/index.vue'),
      meta: { title: '无访问权限' }
    },
    {
      path: '/:pathMatch(.*)*',
      component: () => import('../views/not-found/index.vue'),
      meta: { title: '页面不存在' }
    }
  ],
  scrollBehavior: (_to, _from, saved) => saved || { top: 0 }
})
router.beforeEach((to) => {
  const session = useSessionStore(pinia)
  if (to.meta.requiresAuth && !session.authenticated) return '/forbidden'
  if (to.meta.permission && !session.permissions.includes(to.meta.permission)) return '/forbidden'
})
router.afterEach((to) => {
  document.title = `${to.meta.title || '首页'} - Vue H5 Framework`
})
router.onError(() => showFailToast('页面加载失败，请重试'))
export default router
