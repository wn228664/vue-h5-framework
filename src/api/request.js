/**
 * 模块职责：把框架共享 Pinia 会话注入 HTTP 工厂，供新项目服务适配器调用。
 * VITE_API_BASE_URL 是公开构建配置，缺省 /api；401 只清理当前会话，不擅自决定登录页。
 * 服务层负责业务成功判定和错误反馈；凭证不进入日志或 URL。
 */
import { createHttpClient } from './httpClient.js'
import { pinia } from '../stores/index.js'
import { useSessionStore } from '../stores/session.js'

// 读取器每次访问当前 store，不能在模块加载时冻结一次 token。
export default createHttpClient({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  /**
   * 每次发送/交付时读取应用共享会话，避免模块加载时冻结 token。
   */
  getSession: () => useSessionStore(pinia),
  /**
   * 只清除当前认证周期的本地身份；远端注销与导航由接入方实现。
   */
  onUnauthorized: () => useSessionStore(pinia).clear()
})
