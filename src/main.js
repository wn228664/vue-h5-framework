import { createApp } from 'vue'
import { showFailToast } from 'vant'
import 'vant/es/toast/style'
import App from './App.vue'
import { pinia } from './stores/index.js'
import router from './router/index.js'
import './styles/index.scss'

const app = createApp(App)
app.use(pinia)
app.use(router)
app.config.errorHandler = (error) => {
  // AxiosError 可能携带凭证与响应体，全局日志只记录错误类型。
  console.error('Application error', { name: error?.name, code: error?.code })
  showFailToast('页面发生异常，请刷新后重试')
}
router
  .isReady()
  .then(() => app.mount('#app'))
  .catch((error) => {
    console.error('Router initialization failed', { name: error?.name, code: error?.code })
    document.getElementById('app').textContent = '页面加载失败，请刷新重试'
  })
