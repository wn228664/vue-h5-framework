export const abortError = () => new DOMException('操作已取消', 'AbortError')

/** 中止只停止消费结果；底层原生调用不支持取消时，迟到的完成不会再次交付。 */
export function withCancellation(
  start,
  { signal, timeoutMs = 5000, timeoutMessage = '操作超时' } = {}
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120000)
    throw new RangeError('Invalid timeout')
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    let timer
    let settled = false
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      callback(value)
    }
    const cancel = () => finish(reject, abortError())
    signal?.addEventListener('abort', cancel, { once: true })
    timer = setTimeout(() => finish(reject, new Error(timeoutMessage)), timeoutMs)
    try {
      Promise.resolve(start()).then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error)
      )
    } catch (error) {
      finish(reject, error)
    }
  })
}
