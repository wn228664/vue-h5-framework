import { withCancellation } from '../cancellation.js'
const validHandler = /^[A-Za-z][A-Za-z0-9_]*$/
const registrations = new WeakMap()
const checkName = (name) =>
  typeof name === 'string' && validHandler.test(name) && !(name in Object.prototype)

/** ok 只表示传输状态，业务成功仍由调用方解释；原生 ok:false 原样返回。 */
export async function callNative(
  name,
  payload = {},
  { timeout = 5000, host = globalThis.window, signal } = {}
) {
  if (!checkName(name)) throw new TypeError('Invalid bridge handler')
  if (typeof host?.flutter_inappwebview?.callHandler !== 'function')
    return { ok: false, code: 'BRIDGE_UNAVAILABLE' }
  const result = await withCancellation(
    () => host.flutter_inappwebview.callHandler(name, payload),
    { signal, timeoutMs: timeout, timeoutMessage: 'Bridge timeout' }
  )
  return result && typeof result.ok === 'boolean' ? result : { ok: true, data: result }
}

/** 注销可乱序执行；最后一个监听离开时恢复原值，不复活已注销的回调。 */
export function receiveNative(name, listener, host = globalThis.window) {
  if (!checkName(name) || !host || typeof listener !== 'function')
    throw new TypeError('Invalid bridge listener')
  let names = registrations.get(host)
  if (!names) {
    names = new Map()
    registrations.set(host, names)
  }
  let entry = names.get(name)
  if (!entry) {
    if (host[name] !== undefined && typeof host[name] !== 'function')
      throw new TypeError('Bridge name is occupied')
    entry = { original: host[name], hadOwn: Object.hasOwn(host, name), listeners: [] }
    names.set(name, entry)
  }
  const item = {
    active: true,
    callback: (payload) => {
      if (item.active) return listener(payload)
    }
  }
  entry.listeners.push(item)
  host[name] = item.callback
  return () => {
    if (!item.active) return
    item.active = false
    entry.listeners = entry.listeners.filter((value) => value.active)
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
}
