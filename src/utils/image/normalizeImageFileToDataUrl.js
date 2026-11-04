/** 图片规范化：只接受非空且不超过 20MiB 的 Blob。可用时按 EXIF 解码并缩放，否则保留原图 Data URL；仅 NotFoundError 有界重试。signal 取消整个读取周期，位图晚到须关闭；默认单个解码/读取等待上限沿用 5000ms。 */
import { abortError, withCancellation } from '../cancellation.js'
// check：在分支/重试入口检查取消，已中止立即抛 AbortError。
const check =
  /**
   * 检查信号是否已中止，统一抛标准 AbortError。
   * signal：调用方的取消信号；退出/换图时阻断解码、读取与重试的结果消费。
   */
  (signal) => {
    if (signal?.aborted) throw abortError()
  }

/**
 *  File/Blob → Data URL。优先校正方向并缩放；不支持位图解码时回退原图读取，缩放不作强保证。
 * maxEdge 为像素，quality 为 0..1；只重试临时 NotFoundError，取消时停止读取与后续消费。
 *
 * 返回校正/缩放后的图片 Data URL；平台不支持时允许原图读取，失败继续拒绝。
 * file：调用方选取的 File/Blob；非空、最多 20MiB，输出不写磁盘。
 * options：规范化参数：signal、重试、延迟、quality、maxEdge 与 MIME；非法数值用默认/夹取值。
 */
export async function normalizeImageFileToDataUrl(file, options = {}) {
  // signal：调用方的取消信号；退出/换图时阻断解码、读取与重试的结果消费。
  const { signal } = options
  check(signal)
  if (!(file instanceof Blob) || file.size === 0 || file.size > 20 * 1024 * 1024)
    throw new Error('请选择不超过 20MB 的图片')
  // config：重试配置快照：retries 夹取 0..3、retryDelayMs 夹取 0..2000ms，默认 2/180ms。
  const config = {
    signal,
    retries: Number.isFinite(options.retries)
      ? Math.floor(Math.min(3, Math.max(0, options.retries)))
      : 2,
    retryDelayMs: Number.isFinite(options.retryDelayMs)
      ? Math.min(2000, Math.max(0, options.retryDelayMs))
      : 180
  }
  // quality：画布编码质量 0..1，默认 0.92；PNG 编码可由平台忽略。
  const quality = Number.isFinite(options.quality)
    ? Math.min(1, Math.max(0, options.quality))
    : 0.92
  // maxEdge：输出最长边上限，整数像素 0..8192；默认 0 表示不主动缩放。
  const maxEdge = Number.isFinite(options.maxEdge)
    ? Math.floor(Math.min(8192, Math.max(0, options.maxEdge)))
    : 0
  // type：画布输出 MIME，仅允许 JPEG/PNG/WebP；其它值用 image/jpeg。
  const type = ['image/jpeg', 'image/png', 'image/webp'].includes(options.type)
    ? options.type
    : 'image/jpeg'
  try {
    if (typeof createImageBitmap === 'function' && typeof document !== 'undefined') {
      // bitmap：当前持有的解码位图；finally 关闭，取消后晚到位图另行关闭。
      let bitmap
      try {
        // decodingController：位图子任务取消源；父等待结束时中止后续兼容/重试。
        const decodingController = new AbortController()
        // decoding：底层位图 Promise；取消无法中止已启动解码，故附加晚到清理。
        const decoding = withRetry(
          /**
           * 优先按 EXIF 方向解码，兼容失败时先查取消再尝试普通解码。
           */
          async () => {
            try {
              return await createImageBitmap(file, { imageOrientation: 'from-image' })
            } catch {
              check(decodingController.signal)
              return createImageBitmap(file)
            }
          },
          { ...config, signal: decodingController.signal }
        )
        try {
          bitmap = await withCancellation(
            /**
             * 将底层位图任务交给有限等待器；取消不撤销平台已开始的解码。
             */
            () => decoding,
            { signal }
          )
        } catch (error) {
          // error：读取/解码/重试拒绝值；取消保持 AbortError，其它读图错误带 cause 公开包装。

          decodingController.abort()
          decoding.then(
            /**
             * 父周期结束后的位图只释放，不向调用方发布。
             * lateBitmap：取消/超时后才解码出的位图；仅关闭资源，禁止交给视图。
             */
            (lateBitmap) => lateBitmap?.close?.(),
            /**
             * 消费晚到的解码拒绝，原等待已给出失败，避免未处理拒绝。
             */
            () => {}
          )
          throw error
        }
        check(signal)
        if (!bitmap.width || !bitmap.height) throw new Error('Invalid image dimensions')
        // scale：保持宽高比的缩放比例，最大 1；不会主动放大小图。
        const scale = maxEdge > 0 ? Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height)) : 1
        // canvas：本次离屏编码画布；按位图宽高和 scale 设置正整数像素。
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(bitmap.width * scale))
        canvas.height = Math.max(1, Math.round(bitmap.height * scale))
        // context：画布 2D 上下文；不可用则进入原图读取后备路径。
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas unavailable')
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        check(signal)
        try {
          return canvas.toDataURL(type, quality)
        } catch {
          return canvas.toDataURL('image/jpeg', quality)
        }
      } catch {
        if (signal?.aborted) throw abortError()
      } finally {
        bitmap?.close?.()
      }
    }
    return await withRetry(
      /**
       * 以原图 FileReader 作为不保证缩放的后备读取。
       */
      () => readDataUrl(file, signal),
      config
    )
  } catch (error) {
    // error：读取/解码/重试拒绝值；取消保持 AbortError，其它读图错误带 cause 公开包装。

    if (signal?.aborted || error.name === 'AbortError') throw abortError()
    throw new Error('图片读取失败，请重新选择后重试', { cause: error })
  }
}

/**
 * 读取 Blob 的 Data URL；取消中止 FileReader，所有终态解绑事件。
 * file：调用方选取的 File/Blob；非空、最多 20MiB，输出不写磁盘。
 * signal：调用方的取消信号；退出/换图时阻断解码、读取与重试的结果消费。
 */
function readDataUrl(file, signal) {
  return new Promise(
    /**
     * 为本轮 FileReader 建立独立的成功/失败通道。
     * resolve：当前读取或等待 Promise 的成功终结器。
     * reject：当前读取或等待 Promise 的失败终结器。
     */
    (resolve, reject) => {
      check(signal)
      // reader：本轮 FileReader；取消调用 abort，终态清空 load/error/abort 事件。
      const reader = new FileReader()
      // finish：FileReader 统一终结器；先移除事件与 signal 监听再交付。
      const finish =
        /**
         * 先清理 FileReader 事件与 signal 监听，再完成本次读取。
         * callback：FileReader 选用的 resolve/reject；先清理再执行。
         * value：FileReader 交付的 Data URL 或拒绝原因；原样送给对应终结器。
         */
        (callback, value) => {
          reader.onload = reader.onerror = reader.onabort = null
          signal?.removeEventListener('abort', cancel)
          callback(value)
        }
      // cancel：当前读取或等待的取消回调；移除 timer/监听并拒绝 AbortError。
      const cancel =
        /**
         * 取消读取并拒绝 AbortError，触发 reader.abort 前先卸载事件。
         */
        () => {
          finish(reject, abortError())
          reader.abort()
        }
      reader.onload =
        /**
         * FileReader 成功事件：交付字符串 Data URL。
         */
        () => finish(resolve, String(reader.result || ''))
      reader.onerror =
        /**
         * FileReader 失败事件：优先传平台错误，否则使用稳定缺省错误。
         */
        () => finish(reject, reader.error || new Error('Image read failed'))
      reader.onabort =
        /**
         * 平台自行中止事件：统一交付 AbortError。
         */
        () => finish(reject, abortError())
      signal?.addEventListener('abort', cancel, { once: true })
      try {
        reader.readAsDataURL(file)
      } catch (error) {
        // error：读取/解码/重试拒绝值；取消保持 AbortError，其它读图错误带 cause 公开包装。

        finish(reject, error)
      }
    }
  )
}

/**
 * 仅对临时 NotFoundError 有界重试，其它异常与取消立即拒绝。
 * action：每轮重新调用的本地图片操作；只对 NotFoundError 重试。
 * retries：最多额外尝试次数，0..3；不是总尝试数。
 * retryDelayMs：NotFoundError 两轮之间的等待，毫秒 0..2000；取消立即清理等待。
 * signal：调用方的取消信号；退出/换图时阻断解码、读取与重试的结果消费。
 */
async function withRetry(action, { retries, retryDelayMs, signal }) {
  // attempt：当前零基尝试序号；达到 retries 后不再重试。
  for (let attempt = 0; ; attempt++) {
    check(signal)
    try {
      return await action()
    } catch (error) {
      // error：读取/解码/重试拒绝值；取消保持 AbortError，其它读图错误带 cause 公开包装。

      if (signal?.aborted) throw abortError()
      if (attempt >= retries || error.name !== 'NotFoundError') throw error
      await new Promise(
        /**
         * 等待下一轮重试，同时订阅取消以立即结束等待。
         * resolve：当前读取或等待 Promise 的成功终结器。
         * reject：当前读取或等待 Promise 的失败终结器。
         */
        (resolve, reject) => {
          // cancel：当前读取或等待的取消回调；移除 timer/监听并拒绝 AbortError。
          const cancel =
            /**
             * 取消重试等待，清计时器后拒绝 AbortError。
             */
            () => {
              clearTimeout(timer)
              reject(abortError())
            }
          // timer：重试等待句柄；取消时清除，正常到时移除 abort 监听。
          const timer = setTimeout(
            /**
             * 正常到时先解绑 abort，再允许下一轮执行。
             */
            () => {
              signal?.removeEventListener('abort', cancel)
              resolve()
            },
            retryDelayMs
          )
          signal?.addEventListener('abort', cancel, { once: true })
        }
      )
    }
  }
}
