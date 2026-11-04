/** 为不支持原生取消的 Promise 提供有限等待。取消/超时只终止交付，不能撤销底层副作用；所有终态清理计时器和 abort 监听，迟到成功/失败均被消费但不再发布。 */
// abortError：创建 name=AbortError 的标准 DOMException；供调用方区分用户取消。
export const abortError =
  /**
   * 创建新的 AbortError，避免依赖平台不稳定的取消消息。
   */
  () => new DOMException('操作已取消', 'AbortError')

/**
 * 有限等待 start；无效超时抛 RangeError，取消/超时/异常均拒绝。
 * start：延迟启动函数，可同步返回值、Promise/thenable 或抛错；已中止时不调用。
 * signal：可选调用方 AbortSignal，取消使本次等待拒绝 AbortError。
 * timeoutMs：等待上限，单位毫秒，默认 5000；必须为 (0,120000] 内有限数。
 * timeoutMessage：超时 Error 的可公开说明，默认“操作超时”。
 */
export function withCancellation(
  start,
  { signal, timeoutMs = 5000, timeoutMessage = '操作超时' } = {}
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120000)
    throw new RangeError('Invalid timeout')
  return new Promise(
    /**
     * 建立一次等待周期；预先中止时直接拒绝，不启动底层操作。
     * resolve：本次 Promise 的成功终结器；只能经 finish 使用。
     * reject：本次 Promise 的失败终结器；取消、超时与异常共用。
     */
    (resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError())
        return
      }
      // timer：本次等待的计时器句柄；任一终态清除，不能跨任务复用。
      let timer
      // settled：终态闩锁，初值 false；首个结果后为 true，阻断后续重复交付。
      let settled = false
      // finish：统一终态入口：先置 settled、清计时器和监听，再调用终结器。
      const finish =
        /**
         * 至多终结一次，并在对外通知前释放 timer 与 abort 监听。
         * callback：finish 选择的 resolve/reject；不接受业务回调承担清理责任。
         * value：start 成功结果或传给终结器的值；失败值也可原样传入 reject。
         */
        (callback, value) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal?.removeEventListener('abort', cancel)
          callback(value)
        }
      // cancel：abort 监听器；通过 finish 拒绝并清理等待资源。
      const cancel =
        /**
         * 将外部 abort 转成标准取消拒绝。
         */
        () => finish(reject, abortError())
      signal?.addEventListener('abort', cancel, { once: true })
      timer = setTimeout(
        /**
         * 超时终结当前等待，不撤销已经启动的原生动作。
         */
        () => finish(reject, new Error(timeoutMessage)),
        timeoutMs
      )
      try {
        Promise.resolve(start()).then(
          /**
           * 成功结果经 finish 交付；迟到完成无副作用。
           * value：start 成功结果或传给终结器的值；失败值也可原样传入 reject。
           */
          (value) => finish(resolve, value),
          /**
           * 失败结果经 finish 拒绝；迟到拒绝被处理，避免 unhandled rejection。
           * error：start 同步抛错或异步拒绝值；保持原错误交付，不改成默认成功。
           */
          (error) => finish(reject, error)
        )
      } catch (error) {
        // error：start 同步抛错或异步拒绝值；保持原错误交付，不改成默认成功。

        finish(reject, error)
      }
    }
  )
}
