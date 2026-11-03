import { abortError } from '../cancellation.js'
const check = (signal) => {
  if (signal?.aborted) throw abortError()
}

/** File/Blob → Data URL。优先校正方向并缩放；不支持位图解码时回退原图读取，缩放不作强保证。
 * maxEdge 为像素，quality 为 0..1；只重试临时 NotFoundError，取消时停止读取与后续消费。
 */
export async function normalizeImageFileToDataUrl(file, options = {}) {
  const { signal } = options
  check(signal)
  if (!(file instanceof Blob) || file.size === 0 || file.size > 20 * 1024 * 1024)
    throw new Error('请选择不超过 20MB 的图片')
  const config = {
    signal,
    retries: Number.isFinite(options.retries)
      ? Math.floor(Math.min(3, Math.max(0, options.retries)))
      : 2,
    retryDelayMs: Number.isFinite(options.retryDelayMs)
      ? Math.min(2000, Math.max(0, options.retryDelayMs))
      : 180
  }
  const quality = Number.isFinite(options.quality)
    ? Math.min(1, Math.max(0, options.quality))
    : 0.92
  const maxEdge = Number.isFinite(options.maxEdge)
    ? Math.floor(Math.min(8192, Math.max(0, options.maxEdge)))
    : 0
  const type = ['image/jpeg', 'image/png', 'image/webp'].includes(options.type)
    ? options.type
    : 'image/jpeg'
  try {
    if (typeof createImageBitmap === 'function' && typeof document !== 'undefined') {
      let bitmap
      try {
        bitmap = await withRetry(async () => {
          try {
            return await createImageBitmap(file, { imageOrientation: 'from-image' })
          } catch {
            check(signal)
            return createImageBitmap(file)
          }
        }, config)
        check(signal)
        if (!bitmap.width || !bitmap.height) throw new Error('Invalid image dimensions')
        const scale = maxEdge > 0 ? Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height)) : 1
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(bitmap.width * scale))
        canvas.height = Math.max(1, Math.round(bitmap.height * scale))
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas unavailable')
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        check(signal)
        try {
          return canvas.toDataURL(type, quality)
        } catch {
          return canvas.toDataURL('image/jpeg', quality)
        }
      } catch (error) {
        if (signal?.aborted) throw abortError()
      } finally {
        bitmap?.close?.()
      }
    }
    return await withRetry(() => readDataUrl(file, signal), config)
  } catch (error) {
    if (signal?.aborted || error.name === 'AbortError') throw abortError()
    throw new Error('图片读取失败，请重新选择后重试', { cause: error })
  }
}

function readDataUrl(file, signal) {
  return new Promise((resolve, reject) => {
    check(signal)
    const reader = new FileReader()
    const finish = (callback, value) => {
      reader.onload = reader.onerror = reader.onabort = null
      signal?.removeEventListener('abort', cancel)
      callback(value)
    }
    const cancel = () => {
      finish(reject, abortError())
      reader.abort()
    }
    reader.onload = () => finish(resolve, String(reader.result || ''))
    reader.onerror = () => finish(reject, reader.error || new Error('Image read failed'))
    reader.onabort = () => finish(reject, abortError())
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      reader.readAsDataURL(file)
    } catch (error) {
      finish(reject, error)
    }
  })
}

async function withRetry(action, { retries, retryDelayMs, signal }) {
  for (let attempt = 0; ; attempt++) {
    check(signal)
    try {
      return await action()
    } catch (error) {
      if (signal?.aborted) throw abortError()
      if (attempt >= retries || error.name !== 'NotFoundError') throw error
      await new Promise((resolve, reject) => {
        const cancel = () => {
          clearTimeout(timer)
          reject(abortError())
        }
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', cancel)
          resolve()
        }, retryDelayMs)
        signal?.addEventListener('abort', cancel, { once: true })
      })
    }
  }
}
