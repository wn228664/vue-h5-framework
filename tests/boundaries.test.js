/** 覆盖身份令牌、控制字符路由、浏览器 thenable 与图片取消的边界；用例清理恢复所有全局替身。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHttpClient } from '../src/api/httpClient.js'
import { safeBack } from '../src/router/safeBack.js'
import { requestFullscreen } from '../src/utils/fullscreen.js'
import { normalizeImageFileToDataUrl } from '../src/utils/image/normalizeImageFileToDataUrl.js'

/**
 * 断言即使会话版本不变，令牌替换也使旧请求结果失效。
 */
test('a token replacement invalidates results even when a custom session reader keeps the same revision', async () => {
  // token：自定义会话读取器返回的令牌，版本不变时仍需识别令牌替换。
  let token = 'first'
  // client：当前用例独占的 HTTP 客户端，adapter 为本地替身，不发送真实请求。
  const client = createHttpClient({
    /**
     * 提供令牌可变但版本固定的自定义会话。
     */
    getSession: () => ({ token, revision: 0 }),
    /**
     * 替换令牌后返回旧身份的数据。
     * config：HTTP 客户端交给替身 adapter 的请求配置，用于回显响应和断言认证头。
     */
    adapter: async (config) => {
      token = 'second'
      return { data: 'old identity', status: 200, statusText: 'OK', headers: {}, config }
    }
  })
  await assert.rejects(client.get('/items'), { code: 'SESSION_CHANGED' })
})

/**
 * 断言路径含控制字符时不会进入 HTTP 传输。
 */
test('authenticated paths reject embedded control characters before invoking transport', async () => {
  // sent：替身传输实际执行次数，非法请求必须在进入 adapter 前被拦截。
  let sent = 0
  // client：当前用例独占的 HTTP 客户端，adapter 为本地替身，不发送真实请求。
  const client = createHttpClient({
    /**
     * 记录潜在发送并返回空数据；此用例预期不被执行。
     * config：HTTP 客户端交给替身 adapter 的请求配置，用于回显响应和断言认证头。
     */
    adapter: async (config) => {
      sent++
      return { data: null, status: 200, statusText: 'OK', headers: {}, config }
    }
  })
  // path：当前待校验的路由或请求路径。
  for (const path of ['/items\u0000', '/items\u007f'])
    await assert.rejects(client.get(path), { code: 'INVALID_PATH' })
  assert.equal(sent, 0)
})

/**
 * 逐个验证浏览器会标准化的不安全历史均使用站内兜底。
 */
test('safe back uses the fallback for browser-normalized external or malformed paths', async () => {
  // back：可能被浏览器标准化为站外地址或畸形路径的历史值。
  for (const back of ['/\\outside.invalid', '/\u0000path', ' /path', '//outside.invalid']) {
    // replacement：路由替身收到的安全兜底路径。
    let replacement
    // router：受控路由对象，拦截不安全的 back 或 replace 调用。
    const router = {
      options: { history: { state: { back } } },
      /**
       * 若危险历史触发 back 则令用例失败。
       */
      back: () => assert.fail('must not follow unsafe history'),
      /**
       * 记录实际使用的安全兜底路径。
       * path：当前待校验的路由或请求路径。
       */
      replace: async (path) => {
        replacement = path
      }
    }
    assert.equal(await safeBack(router), false)
    assert.equal(replacement, '/')
  }
})

/**
 * 断言不安全兜底被拒绝，合法本地历史仍执行 back。
 */
test('safe back rejects an unsafe fallback and keeps valid local history behavior', async () => {
  // router：受控路由对象，拦截不安全的 back 或 replace 调用。
  const router = {
    options: { history: { state: { back: null } } },
    /**
     * 空历史的 back 替身；随后被计数版本替换。
     */
    back() {},
    /**
     * 不安全兜底若抵达 replace 则令用例失败。
     */
    replace: () => assert.fail('unsafe fallback must not reach the router')
  }
  await assert.rejects(safeBack(router, '//outside.invalid'), TypeError)
  router.options.history.state.back = '/components?tab=1'
  // returned：合法站内历史执行 back 的次数。
  let returned = 0
  router.back =
    /**
     * 记录有效历史返回的次数。
     */
    () => returned++
  assert.equal(await safeBack(router), true)
  assert.equal(returned, 1)
})

/**
 * 断言平台 thenable 拒绝会传给全屏调用者。
 */
test('fullscreen adopts a platform thenable instead of reporting completion before rejection', async () => {
  await assert.rejects(
    requestFullscreen({
      /**
       * 模拟返回自定义 thenable 的全屏接口。
       */
      requestFullscreen: () => ({
        /**
         * 通过 thenable 失败入口拒绝全屏，覆盖非原生 Promise。
         * _resolve：此失败用例不使用的 Promise 成功入口。
         * reject：当前替身 Promise 的失败入口，用于模拟平台拒绝。
         */
        then: (_resolve, reject) => reject(new Error('denied'))
      })
    }),
    /denied/
  )
})

/**
 * 断言图片取消不等待解码完成，迟到位图仍被关闭。
 * t：Node 测试上下文，用 after 登记恢复全局对象的清理动作。
 */
test('image cancellation settles before browser decode and closes a late bitmap', async (t) => {
  // saved：浏览器全局对象的原始属性描述符，供用例结束后精确还原。
  const saved = ['createImageBitmap', 'document'].map(
    /**
     * 保存将被覆盖的全局属性。
     * key：被临时替换的浏览器全局对象名称。
     */
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]
  )
  t.after(
    /**
     * 用例结束后恢复被覆盖的浏览器全局对象。
     */
    () =>
      saved.forEach(
        /**
         * 根据原描述符还原全局属性，原本不存在则删除。
         * key：被临时替换的浏览器全局对象名称。
         * descriptor：替换前的全局属性描述符；不存在时清理阶段删除临时属性。
         */
        ([key, descriptor]) =>
          descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
      )
  )
  // completeDecode：延迟位图解码的结算函数，取消后再提供迟到位图。
  let completeDecode
  // closed：图片位图 close 的调用次数，用于断言迟到或失败资源得到释放。
  let closed = 0
  globalThis.createImageBitmap =
    /**
     * 模拟尚未完成的位图解码。
     */
    () =>
      new Promise(
        /**
         * 保留解码完成入口，供取消之后注入位图。
         * resolve：当前替身 Promise 的完成入口，由用例控制结算时机。
         */
        (resolve) => {
          completeDecode = resolve
        }
      )
  globalThis.document = {}
  // controller：用例控制的取消信号，用于验证等待中的调用能及时退出。
  const controller = new AbortController()
  // pending：尚未结算的被测操作，用于断言取消、超时或迟到回调。
  const pending = normalizeImageFileToDataUrl(new Blob(['image']), { signal: controller.signal })
  controller.abort()
  // timer：取消断言的外部截止计时器，finally 中必须清理。
  let timer
  try {
    await assert.rejects(
      Promise.race([
        pending,
        new Promise(
          /**
           * 设置外部截止时间，避免取消失效时挂住测试。
           * resolve：当前替身 Promise 的完成入口，由用例控制结算时机。
           */
          (resolve) => {
            timer = setTimeout(
              /**
               * 到期返回标识串；若被采用则取消断言失败。
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
    clearTimeout(timer)
    completeDecode({
      width: 1,
      height: 1,

      /**
       * 记录迟到位图资源的释放。
       */
      close: () => closed++
    })
    await pending.catch(
      /**
       * 消费被测操作已确认的取消拒绝，避免清理阶段重复抛出。
       */
      () => {}
    )
    await new Promise(
      /**
       * 等待一个事件循环，让迟到位图的清理回调完成。
       * resolve：当前替身 Promise 的完成入口，由用例控制结算时机。
       */
      (resolve) => setImmediate(resolve)
    )
  }
  assert.equal(closed, 1)
})
