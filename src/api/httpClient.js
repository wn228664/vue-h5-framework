/**
 * 模块职责：提供固定 API 来源的 HTTP 传输与会话结果隔离，不解释服务端业务信封。
 * 认证请求记录 token 和 revision，成功/失败交付前再次核对；公开传输须显式 authenticated:false。
 * 超时、取消和 HTTP 失败均拒绝，默认不重试；基址、adapter 与显式 headers 必须来自可信宿主配置。
 */
import axios, { AxiosError } from 'axios'

/**
 * 创建一个固定 API 基址的 Axios 实例，默认超时 30000 毫秒。
 * @param {Object} [options] baseURL 默认 /api；getSession 同步返回当前 {token,revision}；adapter 可注入可信传输。
 * @param {Function} [options.onUnauthorized] 仅当前认证请求的 HTTP 401 才触发；默认不做会话清理。
 * @returns {import("axios").AxiosInstance} 成功直接交付 response.data；拒绝包括 INVALID_PATH、SESSION_CHANGED 及 Axios 原始错误。
 * 单次 authenticated:false 不读取/自动附加应用凭证，也不清理当前会话；调用方主动提供的头部仍保留。
 *
 * 创建独立传输实例；成功返回响应 data，失败、取消和身份失效均拒绝。
 * baseURL：创建实例时的可信 API 基址，默认 /api；认证请求不得临时替换。
 * getSession：同步身份读取器，返回 token 与 revision；缺省为空凭证、代次 0。
 * onUnauthorized：当前身份收到 HTTP 401 后调用的同步清理函数；缺省无副作用。
 * adapter：可选可信 Axios 传输替身，测试注入时也必须遵守响应配置契约。
 */
export function createHttpClient({
  baseURL = '/api',
  /**
   * 缺省会话读取器：返回匿名身份，不从浏览器存储恢复凭证。
   */
  getSession = () => ({
    token: '',
    revision: 0
  }),
  /**
   * 缺省 401 处理器：保持无副作用，由宿主注入清理行为。
   */
  onUnauthorized = () => {},
  adapter
} = {}) {
  // 实例保存可信基址和统一超时；单次认证请求不能替换 baseURL。
  // client：固定基址与 30000ms 超时的 Axios 实例；拦截器只归本实例所有。
  const client = axios.create({ baseURL, timeout: 30000, adapter })
  /**
   * 核对本实例捕获的身份快照，只读取一次当前会话，避免两次读取产生不一致结果。
   * @param {Object|undefined} config Axios 完成请求配置；公开请求和配置错误没有会话快照。
   * @returns {boolean} token 或代次任一变化即过期；不能把旧 401 交给新会话清理。
   */
  // changedSession：比较请求捕获的 token/代次与当前身份；公开请求不参与。
  const changedSession =
    /**
     * 核对配置中的发送时身份；没有捕获标记时返回 false。
     * config：本次 Axios 配置；承载来源、认证标志和发送时身份快照。
     */
    (config) => {
      if (!config?.frameworkSessionCaptured) return false
      // current：交付响应时一次读取的身份快照；禁止拆成两次读取。
      const current = getSession()
      return config.sessionRevision !== current.revision || config.sessionToken !== current.token
    }
  /**
   * 创建可被页面辨识的会话过期错误，不继续交付旧响应。
   * @param {Object} config 原配置仅保留在错误对象中，调用方不可直接写入日志。
   * @returns {import("axios").AxiosError} code 为 SESSION_CHANGED。
   */
  // staleError：将过期请求转换为 SESSION_CHANGED；config 可能含凭证，不能直接记录。
  const staleError =
    /**
     * 构造携带原请求配置的 SESSION_CHANGED 错误。
     * config：本次 Axios 配置；承载来源、认证标志和发送时身份快照。
     */
    (config) => new AxiosError('Session changed', 'SESSION_CHANGED', config)
  // 请求拦截器先校验目标，再捕获当前身份；空白、控制字符和反斜杠均不可进入认证路径。
  client.interceptors.request.use(
    /**
     * 请求拦截器：先拒绝不可信路径，再捕获身份并按需附带 Bearer 头。
     * config：本次 Axios 配置；承载来源、认证标志和发送时身份快照。
     */
    (config) => {
      config.frameworkAuthenticated = config.authenticated !== false
      if (config.frameworkAuthenticated) {
        if (
          typeof config.url !== 'string' ||
          /[\\\s\p{Cc}]/u.test(config.url) ||
          /^[a-z][a-z\d+.-]*:/i.test(config.url) ||
          config.url.startsWith('//') ||
          config.baseURL !== baseURL
        ) {
          throw new AxiosError(
            'Authenticated requests require a relative API path',
            'INVALID_PATH',
            config
          )
        }
        // 会话快照同时包含值与代次；自定义读取器没有推进 revision 时仍能发现 token 替换。
        // session：发送前捕获的当前身份；其 token/代次写入请求用于终态校验。
        const session = getSession()
        config.frameworkSessionCaptured = true
        config.sessionRevision = session.revision
        config.sessionToken = session.token
        if (session.token && !config.headers.Authorization)
          config.headers.Authorization = `Bearer ${session.token}`
      }
      return config
    }
  )
  // 两个终态都先做身份检查；取消和网络错误仍经原有错误通道返回。
  client.interceptors.response.use(
    /**
     * 成功拦截器：旧身份结果拒绝交付，当前结果仅解开传输层。
     * response：Axios 成功响应；身份仍有效才交付 data，不解释业务成功码。
     */
    (response) => {
      if (changedSession(response.config)) throw staleError(response.config)
      return response.data
    },
    /**
     * 失败拦截器：旧身份错误隔离，当前 401 才清理，始终保留失败。
     * error：Axios 拒绝值；先做身份隔离，再处理当前 401，最后保持拒绝。
     */
    (error) => {
      if (changedSession(error.config)) return Promise.reject(staleError(error.config))
      if (error.response?.status === 401 && error.config?.frameworkAuthenticated) onUnauthorized()
      return Promise.reject(error)
    }
  )
  return client
}
