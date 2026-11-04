/**
 * 模块职责：保存当前应用实例的内存凭证、权限与会话代次，由认证接入方显式更新。
 * 刷新页面后不自动恢复凭证；这里只提供展示/路由判断，真实权限仍由服务端验证。
 * 变更会话必须走 setSession/clear，使同值 token 的重新认证也使旧请求失效。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// 会话凭证由接入方的认证流程提供；默认不持久化敏感信息。
// useSessionStore：session store 工厂；每个 Pinia 容器拥有独立身份，不跨应用共享令牌。
export const useSessionStore = defineStore(
  'session',
  /**
   * 初始化当前 Pinia 容器的独立身份与更新动作。
   */
  () => {
    // token 仅驻留当前 JS 运行实例；不要把它复制到偏好存储。
    // token：内存字符串凭证，初值空串；只由 setSession/clear 更新，不写偏好存储。
    const token = ref('')
    // 权限列表来自已验证的认证结果，不从路由名称推断权限。
    // permissions：认证结果中的字符串权限数组，初值 []；仅做前端可见性判断。
    const permissions = ref([])
    // 进程内递增代次区分重新登录，包括凭证字符串相同的两个周期。
    // revision：会话代次，初值 0；每次 setSession/clear 递增，使同 token 的新周期也能隔离旧请求。
    const revision = ref(0)
    // 有 token 只表示本地认证资料已注入，不能证明凭证未过期。
    // authenticated：token 是否非空的纯派生布尔值；不保证远端凭证仍有效。
    const authenticated = computed(
      /**
       * 根据 token 非空派生本地认证标志，不发请求。
       */
      () => Boolean(token.value)
    )
    /**
     * 以一次显式身份更新替换内存会话，并先推进代次以使旧 HTTP 结果失效。
     * @param {Object} [value={}] token 仅接受字符串；permissions 仅保留数组中的字符串。
     * @returns {void} 不持久化、不请求登录接口；没有合法 token 时 authenticated 为 false。
     *
     * 推进身份代次后替换合法化的凭证和权限；不持久化。
     * value：认证接入方提供的身份对象，默认 {}；token 非字符串归空、权限只保留字符串。
     */
    function setSession(value = {}) {
      revision.value += 1
      token.value = typeof value?.token === 'string' ? value.token : ''
      permissions.value = Array.isArray(value?.permissions)
        ? value.permissions.filter(
            /**
             * 只保留可供 includes 精确判断的字符串权限。
             * item：外部权限数组中的一项；非字符串不进入本地权限集合。
             */
            (item) => typeof item === 'string'
          )
        : []
    }
    /**
     * 通过同一更新入口撤销凭证及权限，确保退出也推进 revision。
     * @returns {void} 不代表服务端会话已注销，远端退出由接入方执行。
     *
     * 经 setSession 清空身份与权限，确保退出也使旧结果失效。
     */
    function clear() {
      setSession({})
    }
    return { token, permissions, revision, authenticated, setSession, clear }
  }
)
