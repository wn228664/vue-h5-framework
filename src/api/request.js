import { createHttpClient } from './httpClient.js'
import { pinia } from '../stores/index.js'
import { useSessionStore } from '../stores/session.js'

export default createHttpClient({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  getSession: () => useSessionStore(pinia),
  onUnauthorized: () => useSessionStore(pinia).clear()
})
