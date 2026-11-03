/** Fullscreen 前缀兼容；进入/退出的拒绝态必须由调用方处理，通常需要用户手势。 */

export function getFullscreenElement(doc = globalThis.document) {
  return (
    doc?.fullscreenElement ||
    doc?.webkitFullscreenElement ||
    doc?.mozFullScreenElement ||
    doc?.msFullscreenElement ||
    null
  )
}

export function isFullscreen(doc = globalThis.document) {
  return Boolean(getFullscreenElement(doc))
}

export function getFullscreenEnabled(doc = globalThis.document) {
  return (
    doc?.fullscreenEnabled ??
    doc?.webkitFullscreenEnabled ??
    doc?.mozFullScreenEnabled ??
    doc?.msFullscreenEnabled
  )
}

export function getRequestFullscreenFn(el) {
  if (!el) return undefined
  return (
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.mozRequestFullScreen ||
    el.msRequestFullscreen
  )
}

export function canRequestFullscreen(doc = globalThis.document, el = doc?.documentElement) {
  const fn = getRequestFullscreenFn(el)
  if (!fn) return false

  const enabled = getFullscreenEnabled(doc)
  if (typeof enabled === 'boolean') return enabled

  // 兼容：部分浏览器没有 fullscreenEnabled，但 requestFullscreen 可用
  return true
}

export function requestFullscreen(el = globalThis.document?.documentElement) {
  const fn = getRequestFullscreenFn(el)
  if (!fn) return Promise.reject(new Error('UNSUPPORTED_FULLSCREEN'))

  try {
    const ret = fn.call(el)
    return ret instanceof Promise ? ret : Promise.resolve()
  } catch (e) {
    return Promise.reject(e)
  }
}

/** UA 与触摸点只用于交互提示，不作为权限或业务条件。 */
export function isProbablyMobileBrowser(options = {}) {
  const ua = String(
    options.ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '') ?? ''
  ).toLowerCase()
  if (!ua) return false

  const mobileHit = /(android|iphone|ipod|ipad|windows phone|iemobile|mobile)/i.test(ua)
  if (mobileHit) return true

  // iPadOS 13+ 可能伪装成 Macintosh
  const maxTouchPoints =
    typeof options.maxTouchPoints === 'number'
      ? options.maxTouchPoints
      : typeof navigator !== 'undefined'
        ? navigator.maxTouchPoints
        : 0
  const isIPadOS = ua.includes('macintosh') && maxTouchPoints > 1
  return isIPadOS
}

export function isStandaloneDisplayMode() {
  try {
    // iOS Safari
    if (typeof navigator !== 'undefined' && navigator.standalone) return true
    // 标准 PWA
    return (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(display-mode: standalone)')?.matches === true
    )
  } catch {
    return false
  }
}

export function exitFullscreen(doc = globalThis.document) {
  const exit =
    doc?.exitFullscreen ||
    doc?.webkitExitFullscreen ||
    doc?.mozCancelFullScreen ||
    doc?.msExitFullscreen
  if (!exit) return Promise.reject(new Error('UNSUPPORTED_FULLSCREEN'))
  try {
    return Promise.resolve(exit.call(doc))
  } catch (error) {
    return Promise.reject(error)
  }
}
