/**
 * 判断标准 writeText 是否确为可调用方法，不按同名真值猜能力。
 */
function canUseClipboardApi() {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.clipboard) &&
    typeof navigator.clipboard.writeText === 'function'
  )
}

/**
 * 等待标准 Clipboard 写入成功后返回 true；权限拒绝交上层决定回退。
 * value：已归一的待复制文本；空串不执行复制，底层 helper 接收同一字符串。
 */
async function copyViaClipboardApi(value) {
  await navigator.clipboard.writeText(value)
  return true
}

/**
 * 创建只读不可交互的 textarea；插入、选中与销毁由调用者负责。
 * value：已归一的待复制文本；空串不执行复制，底层 helper 接收同一字符串。
 */
function createHiddenTextarea(value) {
  // textarea：只在 execCommand 后备路径创建的只读隐藏节点；finally 移除。
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  return textarea
}

// finally 同时清理临时节点与焦点，防止旧浏览器失败后残留隐藏输入框。
/**
 * 在临时节点中执行旧式复制；无论成功失败都移除节点并恢复焦点。
 * value：已归一的待复制文本；空串不执行复制，底层 helper 接收同一字符串。
 */
function copyViaExecCommand(value) {
  // body：当前 document.body，缺失时后备复制返回 false，不操作 DOM。
  const body = typeof document !== 'undefined' ? document.body : null
  if (!body) return false

  // previousFocus：复制前的焦点节点；finally 仅在节点仍连入文档时恢复。
  const previousFocus = document.activeElement
  // textarea：只在 execCommand 后备路径创建的只读隐藏节点；finally 移除。
  const textarea = createHiddenTextarea(value)
  body.appendChild(textarea)

  try {
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    return Boolean(document.execCommand && document.execCommand('copy'))
  } finally {
    if (textarea.parentNode === body) {
      body.removeChild(textarea)
    }
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
  }
}

/**
 * 优先 Clipboard API，当前周期内权限拒绝才回退 execCommand；普通失败返回 false。
 * signal/timeoutMs 只取消结果等待，不能撤销浏览器已经发出的原生复制动作。
 * 超时/取消后即使原生操作迟到失败，也不再创建隐藏输入框或触发后备复制。
 *
 * 校验输入并有限等待复制；只在当前周期进入后备路径。
 * text：调用方的待复制输入；仅字符串有效，不序列化对象。
 * signal：调用方取消信号；停止等待后不消费旧复制结果。
 * timeoutMs：复制等待上限，毫秒，默认 5000；沿用 withCancellation 范围限制。
 */
export async function copyToClipboard(text, { signal, timeoutMs = 5000 } = {}) {
  // value：已归一的待复制文本；空串不执行复制，底层 helper 接收同一字符串。
  const value = typeof text === 'string' ? text : ''
  if (!value) return false
  // owner：本地周期 AbortController；外层终态 finally 中止，用于拒绝迟到后备动作。
  const owner = new AbortController()
  try {
    return await withCancellation(
      /**
       * 尝试标准 API；当前周期拒绝才后备复制，结束周期抛取消。
       */
      async () => {
        try {
          if (canUseClipboardApi()) return await copyViaClipboardApi(value)
        } catch {
          // 当前周期的权限拒绝可进入后备路径；结束周期不得再影响 DOM 或剪贴板。
        }
        if (owner.signal.aborted) throw abortError()
        try {
          return copyViaExecCommand(value)
        } catch {
          return false
        }
      },
      { signal, timeoutMs, timeoutMessage: '复制超时，请重试' }
    )
  } finally {
    owner.abort()
  }
}
import { abortError, withCancellation } from './cancellation.js'
