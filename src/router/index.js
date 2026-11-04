/**
 * 模块职责：声明中性页面、懒加载、缓存元数据、认证/权限边界与页面标题。
 * 基于 Vite BASE_URL 使用 history；部署子路径必须同步静态资源前缀与 history 回退。
 * 守卫只决定本地页面可见性，不替代服务端鉴权；加载失败显示可恢复提示，不猜业务路由。
 */
import { createRouter, createWebHistory } from 'vue-router'
import { showFailToast } from 'vant'
import { pinia } from '../stores/index.js'
import { useSessionStore } from '../stores/session.js'

// 路由树只包含框架首页、组件验证和状态页；真实服务模块由新项目单独接入。
// router：基于 Vite BASE_URL 的唯一 history 路由器；静态站部署须提供 history 回退。
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      /**
       * 按需加载底栏布局，加载失败交全局路由错误入口。
       */
      component: () => import('../layouts/TabLayout.vue'),
      children: [
        {
          path: '',
          name: 'home',
          /**
           * 按需加载框架首页。
           */
          component: () => import('../views/home/index.vue'),
          meta: { title: '首页', keepAlive: true }
        },
        {
          path: 'components',
          name: 'components',
          /**
           * 按需加载组件验证页。
           */
          component: () => import('../views/components/index.vue'),
          meta: { title: '通用组件', keepAlive: true }
        }
      ]
    },
    {
      path: '/forbidden',
      /**
       * 按需加载中性的无权限页。
       */
      component: () => import('../views/forbidden/index.vue'),
      meta: { title: '无访问权限' }
    },
    {
      path: '/:pathMatch(.*)*',
      /**
       * 按需加载未知路径状态页。
       */
      component: () => import('../views/not-found/index.vue'),
      meta: { title: '页面不存在' }
    }
  ],
  // saved 来自浏览器历史滚动恢复，其余导航回到页首；H5 保留自然页面滚动。
  /**
   * 优先恢复浏览器历史位置，其余导航回到页首。
   * _to：滚动策略接收的目标路由；此策略不按路由区分滚动。
   * _from：滚动策略接收的来源路由；当前不使用其内容。
   * saved：浏览器历史恢复位置；存在时原样返回，否则回到顶部。
   */
  scrollBehavior: (_to, _from, saved) => saved || { top: 0 }
})
// to.meta.requiresAuth 和 permission 由注册路由声明，未满足时跳转中性 403。
router.beforeEach(
  /**
   * 导航前读取当前身份；未满足认证或权限时进入中性 403。
   * to：待进入/已确认的路由；守卫读取权限元数据，afterEach 读取标题。
   */
  (to) => {
    // session：守卫当次读取的共享身份；仅决定页面可见性，不替代服务端权限检查。
    const session = useSessionStore(pinia)
    if (to.meta.requiresAuth && !session.authenticated) return '/forbidden'
    if (to.meta.permission && !session.permissions.includes(to.meta.permission)) return '/forbidden'
  }
)
// 只有导航确认后更新文档标题；标题来自显式元数据。
router.afterEach(
  /**
   * 导航确认后更新文档标题，默认显示首页标题。
   * to：待进入/已确认的路由；守卫读取权限元数据，afterEach 读取标题。
   */
  (to) => {
    document.title = `${to.meta.title || '首页'} - Vue H5 Framework`
  }
)
// 错误回调不输出路由参数或原始异常对象，以免泄漏查询信息。
router.onError(
  /**
   * 路由 chunk 失败时提示用户重试，不记录路由查询信息。
   */
  () => showFailToast('页面加载失败，请重试')
)
export default router
