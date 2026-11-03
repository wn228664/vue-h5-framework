function canUseClipboardApi() {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.clipboard) &&
    typeof navigator.clipboard.writeText === 'function'
  )
}

async function copyViaClipboardApi(value) {
  await navigator.clipboard.writeText(value)
  return true
}

function createHiddenTextarea(value) {
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
function copyViaExecCommand(value) {
  const body = typeof document !== 'undefined' ? document.body : null
  if (!body) return false

  const previousFocus = document.activeElement
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

/** 优先 Clipboard API，拒绝后回退 execCommand；返回 boolean，由调用方展示权限失败。 */
export async function copyToClipboard(text) {
  const value = typeof text === 'string' ? text : ''
  if (!value) return false

  try {
    if (canUseClipboardApi()) {
      return await copyViaClipboardApi(value)
    }
  } catch {
    // 权限拒绝或环境不支持时尝试旧浏览器路径。
  }

  try {
    return copyViaExecCommand(value)
  } catch {
    return false
  }
}
