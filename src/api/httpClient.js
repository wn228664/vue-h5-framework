import axios, { AxiosError } from 'axios'

/** 返回原始业务响应；认证请求仅接受本实例的相对路径，隔离旧会话的成功及失败结果。 */
export function createHttpClient({
  baseURL = '/api',
  getSession = () => ({ token: '', revision: 0 }),
  onUnauthorized = () => {},
  adapter
} = {}) {
  const client = axios.create({ baseURL, timeout: 30000, adapter })
  const changedSession = (config) =>
    config?.frameworkSessionCaptured && config.sessionRevision !== getSession().revision
  const staleError = (config) => new AxiosError('Session changed', 'SESSION_CHANGED', config)
  client.interceptors.request.use((config) => {
    config.frameworkAuthenticated = config.authenticated !== false
    if (config.frameworkAuthenticated) {
      if (
        typeof config.url !== 'string' ||
        /[\\\s]/.test(config.url) ||
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
      const session = getSession()
      config.frameworkSessionCaptured = true
      config.sessionRevision = session.revision
      if (session.token && !config.headers.Authorization)
        config.headers.Authorization = `Bearer ${session.token}`
    }
    return config
  })
  client.interceptors.response.use(
    (response) => {
      if (changedSession(response.config)) throw staleError(response.config)
      return response.data
    },
    (error) => {
      if (changedSession(error.config)) return Promise.reject(staleError(error.config))
      if (error.response?.status === 401 && error.config?.frameworkAuthenticated) onUnauthorized()
      return Promise.reject(error)
    }
  )
  return client
}
