/**
 *  Fullscreen 前缀兼容；进入/退出的拒绝态必须由调用方处理，通常需要用户手势。
 *
 * 按优先级挑选可调用平台方法，忽略同名非函数属性。
 * target：待寻找平台方法的 Document/Element；可能不存在。
 * names：按标准、WebKit、Mozilla、MS 优先顺序排列的方法名数组。
 */
function pickMethod(target, names) {
  // name：首个确为函数的属性名；未找到为 undefined。
  const name = names.find(
    /**
     * 逐候选检查真实方法类型，不调用目标。
     * candidate：当前候选方法名；非函数同名属性须继续查后续前缀。
     */
    (candidate) => typeof target?.[candidate] === 'function'
  )
  return name ? target[name] : undefined
}

/**
 * 取得标准或前缀的全屏元素，无全屏时返回 null。
 * doc：待查询/退出全屏的 Document，默认当前 document；可注入测试替身。
 */
export function getFullscreenElement(doc = globalThis.document) {
  return (
    doc?.fullscreenElement ||
    doc?.webkitFullscreenElement ||
    doc?.mozFullScreenElement ||
    doc?.msFullscreenElement ||
    null
  )
}

/**
 * 依据真实全屏元素判断当前是否已进入全屏。
 * doc：待查询/退出全屏的 Document，默认当前 document；可注入测试替身。
 */
export function isFullscreen(doc = globalThis.document) {
  return Boolean(getFullscreenElement(doc))
}

/**
 * 读取平台能力布尔值，缺失保持 undefined 而非伪造支持。
 * doc：待查询/退出全屏的 Document，默认当前 document；可注入测试替身。
 */
export function getFullscreenEnabled(doc = globalThis.document) {
  return (
    doc?.fullscreenEnabled ??
    doc?.webkitFullscreenEnabled ??
    doc?.mozFullScreenEnabled ??
    doc?.msFullscreenEnabled
  )
}

/**
 * 取得标准/前缀进入函数；调用方必须绑定元素 this。
 * el：待进入全屏的 Element，默认文档根元素；调用必须来自用户手势。
 */
export function getRequestFullscreenFn(el) {
  if (!el) return undefined
  return pickMethod(el, [
    'requestFullscreen',
    'webkitRequestFullscreen',
    'mozRequestFullScreen',
    'msRequestFullscreen'
  ])
}

/**
 * 结合可调用进入函数与平台启用提示判断能力。
 * doc：待查询/退出全屏的 Document，默认当前 document；可注入测试替身。
 * el：待进入全屏的 Element，默认文档根元素；调用必须来自用户手势。
 */
export function canRequestFullscreen(doc = globalThis.document, el = doc?.documentElement) {
  // fn：选中的进入全屏函数；调用时必须以 el 作为 this。
  const fn = getRequestFullscreenFn(el)
  if (!fn) return false

  // enabled：平台 fullscreenEnabled 布尔提示；缺失时按可调用方法判断。
  const enabled = getFullscreenEnabled(doc)
  if (typeof enabled === 'boolean') return enabled

  // 兼容：部分浏览器没有 fullscreenEnabled，但 requestFullscreen 可用
  return true
}

/**
 * 请求元素全屏；兼容 void/Promise/thenable，并统一同步异常为拒绝。
 * el：待进入全屏的 Element，默认文档根元素；调用必须来自用户手势。
 */
export function requestFullscreen(el = globalThis.document?.documentElement) {
  // fn：选中的进入全屏函数；调用时必须以 el 作为 this。
  const fn = getRequestFullscreenFn(el)
  if (!fn) return Promise.reject(new Error('UNSUPPORTED_FULLSCREEN'))

  try {
    // ret：平台进入全屏的返回值，可能是 void/Promise/thenable；Promise.resolve 同化。
    const ret = fn.call(el)
    return Promise.resolve(ret)
  } catch (e) {
    // e：平台进入全屏同步异常；转为 Promise 拒绝以统一调用方式。

    return Promise.reject(e)
  }
}

/**
 * 按 UA 与触摸点估计移动提示，仅用于展示策略。
 * options：移动提示探测参数；仅 ua/maxTouchPoints 可替代平台值，不用于鉴权。
 */
export function isProbablyMobileBrowser(options = {}) {
  // ua：转小写的 UA 文本；没有 UA 时不能判断移动提示。
  const ua = String(
    options.ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '') ?? ''
  ).toLowerCase()
  if (!ua) return false

  // mobileHit：UA 是否包含移动设备标识；仅决定提示策略。
  const mobileHit = /(android|iphone|ipod|ipad|windows phone|iemobile|mobile)/i.test(ua)
  if (mobileHit) return true

  // iPadOS 13+ 可能伪装成 Macintosh
  // maxTouchPoints：触摸点上限；优先显式数值，否则读取 navigator，缺失为 0。
  const maxTouchPoints =
    typeof options.maxTouchPoints === 'number'
      ? options.maxTouchPoints
      : typeof navigator !== 'undefined'
        ? navigator.maxTouchPoints
        : 0
  // isIPadOS：Macintosh UA 且触摸点大于 1 的提示性判断；不作为设备安全边界。
  const isIPadOS = ua.includes('macintosh') && maxTouchPoints > 1
  return isIPadOS
}

/**
 * 识别 iOS standalone 或标准 PWA 显示模式；受限环境返回 false。
 */
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

/**
 * 退出文档全屏；缺失能力和平台拒绝均保持失败。
 * doc：待查询/退出全屏的 Document，默认当前 document；可注入测试替身。
 */
export function exitFullscreen(doc = globalThis.document) {
  // exit：标准/前缀退出函数；调用时绑定 doc，缺失则拒绝 unsupported。
  const exit = pickMethod(doc, [
    'exitFullscreen',
    'webkitExitFullscreen',
    'mozCancelFullScreen',
    'msExitFullscreen'
  ])
  if (!exit) return Promise.reject(new Error('UNSUPPORTED_FULLSCREEN'))
  try {
    return Promise.resolve(exit.call(doc))
  } catch (error) {
    // error：平台退出全屏的同步异常；保留为 Promise 拒绝。

    return Promise.reject(error)
  }
}
