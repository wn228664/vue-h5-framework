/** Flutter WebView 桥：仅传输中性载荷，不解释业务成功。方法名禁止原型属性；每个宿主的监听独立保存，注销乱序安全，最后注销时恢复原属性。host 缺省当前 window，测试可注入替身。 */
import { withCancellation } from '../cancellation.js'
// validHandler：桥方法名规则：字母开头，后续仅字母/数字/下划线。
const validHandler = /^[A-Za-z][A-Za-z0-9_]*$/
// registrations：按宿主弱引用保存监听名表；不因注册表永久保留已释放窗口。
const registrations = new WeakMap()
// checkName：方法名校验器；除正则外排除 Object.prototype 上已有名称。
const checkName =
  /**
   * 校验桥方法名并排除原型属性，返回布尔值。
   * name：桥调用或全局回调名称；必须通过 checkName，禁止任意属性路径。
   */
  (name) => typeof name === 'string' && validHandler.test(name) && !(name in Object.prototype)

/**
 * 调用原生并有限等待；不可用返回 BRIDGE_UNAVAILABLE，取消/超时继续拒绝。
 * name：桥调用或全局回调名称；必须通过 checkName，禁止任意属性路径。
 * payload：待传给原生或由原生回调传入的载荷；内容契约与敏感性由接入方负责。
 * timeout：等待原生结果的正毫秒数，默认 5000；有效范围与 withCancellation 一致。
 * host：WebView 宿主对象，缺省 window；该对象的桥能力与属性所有权必须可信。
 * signal：调用方的 AbortSignal；只停止交付等待，不能撤销原生已执行副作用。
 */
export async function callNative(
  name,
  payload = {},
  { timeout = 5000, host = globalThis.window, signal } = {}
) {
  if (!checkName(name)) throw new TypeError('Invalid bridge handler')
  if (typeof host?.flutter_inappwebview?.callHandler !== 'function')
    return { ok: false, code: 'BRIDGE_UNAVAILABLE' }
  // result：原生返回值；有布尔 ok 时原样交付，否则包成传输成功信封。
  const result = await withCancellation(
    /**
     * 把当前 name/payload 交给宿主原生桥；底层拒绝仍经 Promise 传播。
     */
    () => host.flutter_inappwebview.callHandler(name, payload),
    { signal, timeoutMs: timeout, timeoutMessage: 'Bridge timeout' }
  )
  return result && typeof result.ok === 'boolean' ? result : { ok: true, data: result }
}

/**
 * 安装一个可注销的原生回调，返回幂等清理函数；冲突的非函数属性拒绝覆盖。
 * name：桥调用或全局回调名称；必须通过 checkName，禁止任意属性路径。
 * listener：同步原生消息处理函数；重复触发与业务副作用由接入方决定。
 * host：WebView 宿主对象，缺省 window；该对象的桥能力与属性所有权必须可信。
 */
export function receiveNative(name, listener, host = globalThis.window) {
  if (!checkName(name) || !host || typeof listener !== 'function')
    throw new TypeError('Invalid bridge listener')
  // names：当前 host 的方法名 Map；最后一个名称注销后移出弱引用表。
  let names = registrations.get(host)
  if (!names) {
    names = new Map()
    registrations.set(host, names)
  }
  // entry：单个名称的原属性快照与活动监听列表；恢复时保留 hadOwn 差异。
  let entry = names.get(name)
  if (!entry) {
    if (host[name] !== undefined && typeof host[name] !== 'function')
      throw new TypeError('Bridge name is occupied')
    entry = { original: host[name], hadOwn: Object.hasOwn(host, name), listeners: [] }
    names.set(name, entry)
  }
  // item：当前注册记录，active 防止已注销回调再次调用 listener。
  const item = {
    active: true,
    /**
     * 只在本注册仍 active 时交付一次原生消息；注销后保存的旧引用也失效。
     * payload：待传给原生或由原生回调传入的载荷；内容契约与敏感性由接入方负责。
     */
    callback: (payload) => {
      if (item.active) return listener(payload)
    }
  }
  entry.listeners.push(item)
  host[name] = item.callback
  // `cleanup`：注销当前监听并恢复被占用的宿主属性；调用方在卸载、切换或取消时执行一次。
  return (
    /**
     * 注销本记录；只在仍持有宿主属性时恢复最后活动监听或原属性，不覆盖外部替换。
     */
    () => {
      if (!item.active) return
      item.active = false
      entry.listeners = entry.listeners.filter(
        /**
         * 保留仍然活动的注册，禁止复活已注销监听。
         * value：监听列表中待保留的注册记录；只保留 active 项。
         */
        (value) => value.active
      )
      if (host[name] === item.callback) {
        if (entry.listeners.length) host[name] = entry.listeners.at(-1).callback
        else if (entry.hadOwn) host[name] = entry.original
        else delete host[name]
      }
      if (!entry.listeners.length) {
        names.delete(name)
        if (!names.size) registrations.delete(host)
      }
    }
  )
}
