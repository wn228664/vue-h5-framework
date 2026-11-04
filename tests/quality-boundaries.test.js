/** 验证全屏平台前缀以及剪贴板取消、超时；替身故意保持未完成以排除提前报告成功。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canRequestFullscreen, requestFullscreen, exitFullscreen } from '../src/utils/fullscreen.js'
import { copyToClipboard } from '../src/utils/clipboard.js'

/**
 * 断言非函数标准字段不算能力，同时正确使用可调用的平台前缀。
 */
test('fullscreen capabilities skip non-callable standard fields and retain supported prefixes', async () => {
  assert.equal(canRequestFullscreen({}, { requestFullscreen: true }), false)
  // entered：前缀全屏进入方法的调用次数。
  let entered = 0
  await requestFullscreen({
    requestFullscreen: true,

    /**
     * 记录 webkit 前缀的进入全屏调用。
     */
    webkitRequestFullscreen: () => entered++
  })
  assert.equal(entered, 1)
  // exited：前缀全屏退出方法的调用次数。
  let exited = 0
  await exitFullscreen({
    exitFullscreen: {},

    /**
     * 记录 webkit 前缀的退出全屏调用。
     */
    webkitExitFullscreen: () => exited++
  })
  assert.equal(exited, 1)
})

/**
 * 断言取消剪贴板不必等待原生权限弹窗，也不再启动 DOM 回退。
 * t：Node 测试上下文，用 after 登记恢复全局对象的清理动作。
 */
test('clipboard cancellation settles without waiting for a native permission prompt', async (t) => {
  // saved：浏览器全局对象的原始属性描述符，供用例结束后精确还原。
  const saved = ['navigator', 'document'].map(
    /**
     * 保存浏览器全局属性描述符。
     * key：被临时替换的浏览器全局对象名称。
     */
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]
  )
  t.after(
    /**
     * 清理 navigator 和 document 的临时替身。
     */
    () =>
      saved.forEach(
        /**
         * 还原原始属性或删除测试新增的全局对象。
         * key：被临时替换的浏览器全局对象名称。
         * descriptor：替换前的全局属性描述符；不存在时清理阶段删除临时属性。
         */
        ([key, descriptor]) =>
          descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
      )
  )
  // rejectNative：原生剪贴板 Promise 的拒绝入口，用于模拟取消后的迟到拒绝。
  let rejectNative
  // fallbacks：DOM 复制回退被启动的次数，取消后必须为零。
  let fallbacks = 0
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        /**
         * 模拟等待用户权限的原生写入。
         */
        writeText: () =>
          new Promise(
            /**
             * 保留原生拒绝入口，供取消后模拟迟到错误。
             * _resolve：此失败用例不使用的 Promise 成功入口。
             * reject：当前替身 Promise 的失败入口，用于模拟平台拒绝。
             */
            (_resolve, reject) => {
              rejectNative = reject
            }
          )
      }
    }
  })
  globalThis.document = {
    body: {},
    /**
     * 若取消后尝试 DOM 回退则计数并报错。
     */
    createElement: () => {
      fallbacks++
      throw new Error('fallback must not run after cancellation')
    }
  }
  // controller：用例控制的取消信号，用于验证等待中的调用能及时退出。
  const controller = new AbortController()
  // pending：尚未结算的被测操作，用于断言取消、超时或迟到回调。
  const pending = copyToClipboard('fixture', { signal: controller.signal })
  controller.abort()
  // deadline：外部测试截止计时器，清理阶段取消以免残留。
  let deadline
  try {
    await assert.rejects(
      Promise.race([
        pending,
        new Promise(
          /**
           * 建立取消断言的外部截止时间。
           * resolve：当前替身 Promise 的完成入口，由用例控制结算时机。
           */
          (resolve) => {
            deadline = setTimeout(
              /**
               * 到期完成测试等待；出现此结果意味着取消未及时退出。
               */
              () => resolve('still waiting'),
              40
            )
          }
        )
      ]),
      { name: 'AbortError' }
    )
  } finally {
    clearTimeout(deadline)
    rejectNative(new Error('late permission denial'))
    await pending.catch(
      /**
       * 清理中消费已验证的取消拒绝。
       */
      () => {}
    )
    await new Promise(
      /**
       * 等待一个事件循环处理迟到原生拒绝。
       * resolve：当前替身 Promise 的完成入口，由用例控制结算时机。
       */
      (resolve) => setImmediate(resolve)
    )
  }
  assert.equal(fallbacks, 0)
})

/**
 * 断言原生仍未完成时调用者能通过框架超时退出。
 * t：Node 测试上下文，用 after 登记恢复全局对象的清理动作。
 */
test('clipboard timeout releases the caller while the native operation is still pending', async (t) => {
  // saved：浏览器全局对象的原始属性描述符，供用例结束后精确还原。
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  t.after(
    /**
     * 恢复被测试替换的 navigator 属性。
     */
    () =>
      saved ? Object.defineProperty(globalThis, 'navigator', saved) : delete globalThis.navigator
  )
  // completeNative：原生剪贴板 Promise 的完成入口，在超时断言后结算。
  let completeNative
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        /**
         * 模拟不会自动完成的原生剪贴板写入。
         */
        writeText: () =>
          new Promise(
            /**
             * 保存原生完成入口，供 finally 清理。
             * resolve：当前替身 Promise 的完成入口，由用例控制结算时机。
             */
            (resolve) => {
              completeNative = resolve
            }
          )
      }
    }
  })
  // pending：尚未结算的被测操作，用于断言取消、超时或迟到回调。
  const pending = copyToClipboard('fixture', { timeoutMs: 5 })
  // deadline：外部测试截止计时器，清理阶段取消以免残留。
  let deadline
  try {
    await assert.rejects(
      Promise.race([
        pending,
        new Promise(
          /**
           * 设置超时断言的外部截止计时器。
           * resolve：当前替身 Promise 的完成入口，由用例控制结算时机。
           */
          (resolve) => {
            deadline = setTimeout(
              /**
               * 外部截止时间到期时完成等待，用于防止测试挂起。
               */
              () => resolve('still waiting'),
              40
            )
          }
        )
      ]),
      /超时/
    )
  } finally {
    clearTimeout(deadline)
    completeNative()
    await pending.catch(
      /**
       * 消费已经断言过的超时拒绝。
       */
      () => {}
    )
  }
})
