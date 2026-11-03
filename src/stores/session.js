import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// 会话凭证由接入方的认证流程提供；默认不持久化敏感信息。
export const useSessionStore = defineStore('session', () => {
  const token = ref('')
  const permissions = ref([])
  const revision = ref(0)
  const authenticated = computed(() => Boolean(token.value))
  function setSession(value = {}) {
    revision.value += 1
    token.value = typeof value?.token === 'string' ? value.token : ''
    permissions.value = Array.isArray(value?.permissions)
      ? value.permissions.filter((item) => typeof item === 'string')
      : []
  }
  function clear() {
    setSession({})
  }
  return { token, permissions, revision, authenticated, setSession, clear }
})
