/**
 * 模块职责：装配 Vue、Pinia、路由与全局主题样式，在路由就绪后挂载应用。
 * 全局错误只记录类型/代码并提示恢复，不把 Axios 配置、凭证或响应体直接写日志。
 * 根节点由 index.html 提供；初始化失败保留可见文字，避免只留下空白容器。
 */
import { createApp } from 'vue'
import { showFailToast } from 'vant'
import 'vant/es/toast/style'
import App from './App.vue'
import { pinia } from './stores/index.js'
import router from './router/index.js'
import './styles/index.scss'
import { getErrorInfo } from './utils/errors.js'

// 本实例负责挂载与错误回调；插件安装顺序保证路由守卫能访问 Pinia。
// app：本页唯一 Vue 根实例；先安装共享 Pinia/Router，待初始导航就绪再挂载。
const app = createApp(App)
app.use(pinia)
app.use(router)
// Vue 捕获的组件异常在这里公开化；API 的业务失败仍应由服务/页面自行处理。
app.config.errorHandler =
  /**
   * 全局组件异常入口：记录有限诊断字段并提示刷新，不吞成成功。
   * error：Vue 捕获或路由初始化的原始拒绝值；只投影 name/code，禁止直接记录配置或响应体。
   */
  (error) => {
    // AxiosError 可能携带凭证与响应体，全局日志只记录错误类型。
    console.error('Application error', getErrorInfo(error))
    showFailToast('页面发生异常，请刷新后重试')
  }
// isReady 的拒绝发生在挂载前，用静态文字反馈而非依赖尚未挂载的组件。
router
  .isReady()
  .then(
    /**
     * 初始导航成功后只挂载一次应用根。
     */
    () => app.mount('#app')
  )
  .catch(
    /**
     * 初始化拒绝时记录有限诊断并填充静态恢复文案，避免空白页。
     * error：Vue 捕获或路由初始化的原始拒绝值；只投影 name/code，禁止直接记录配置或响应体。
     */
    (error) => {
      console.error('Router initialization failed', getErrorInfo(error))
      document.getElementById('app').textContent = '页面加载失败，请刷新重试'
    }
  )
