/** 验证 HTTP 传输、身份切换、原生桥接和安全返回的基础契约；所有平台接口由本地替身提供。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AxiosError } from 'axios'
import { createHttpClient } from '../src/api/httpClient.js'
import { callNative, receiveNative } from '../src/utils/bridge/index.js'
import { safeBack } from '../src/router/safeBack.js'

/**
 * 断言 HTTP 只传输 payload，不把 success=false 擅自视为请求异常。
 */
test('HTTP transports payloads without assuming a business success code', async () => {
  // client：当前用例独占的 HTTP 客户端，adapter 为本地替身，不发送真实请求。
  const client = createHttpClient({
    /**
     * 提供固定的测试身份和版本。
     */
    getSession: () => ({ token: 'test-token', revision: 1 }),
    /**
     * 核对认证头与默认超时后返回业务失败 payload。
     * config：HTTP 客户端交给替身 adapter 的请求配置，用于回显响应和断言认证头。
     */
    adapter: async (config) => {
      assert.equal(config.headers.Authorization, 'Bearer test-token')
      assert.equal(config.timeout, 30000)
      return {
        data: { success: false, message: 'rejected' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config
      }
    }
  })
  assert.deepEqual(await client.get('/example'), { success: false, message: 'rejected' })
})

/**
 * 断言迟到的旧会话 401 不能清除新会话。
 */
test('a delayed unauthorized response cannot clear a newer session', async () => {
  // revision：可变会话版本，用于模拟请求执行期间发生身份切换。
  let revision = 1
  // cleared：清理认证状态回调的执行次数，用于排除误清除新会话。
  let cleared = 0
  // client：当前用例独占的 HTTP 客户端，adapter 为本地替身，不发送真实请求。
  const client = createHttpClient({
    /**
     * 读取可变版本以模拟切换中的身份。
     */
    getSession: () => ({ token: 'test-token', revision }),
    /**
     * 记录清除会话的次数，预期旧响应不触发。
     */
    onUnauthorized: () => {
      cleared++
    },
    /**
     * 先推进身份版本再拒绝请求，模拟过期的 401。
     * config：HTTP 客户端交给替身 adapter 的请求配置，用于回显响应和断言认证头。
     */
    adapter: async (config) => {
      revision++
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, {}, { status: 401 })
    }
  })
  await assert.rejects(client.get('/example'), { code: 'SESSION_CHANGED' })
  assert.equal(cleared, 0)
})

/**
 * 断言当前身份的 401 清除会话并继续向调用者拒绝。
 */
test('current unauthorized responses clear the session and remain rejected', async () => {
  // cleared：清理认证状态回调的执行次数，用于排除误清除新会话。
  let cleared = 0
  // client：当前用例独占的 HTTP 客户端，adapter 为本地替身，不发送真实请求。
  const client = createHttpClient({
    /**
     * 记录当前身份的认证清理。
     */
    onUnauthorized: () => {
      cleared++
    },
    /**
     * 模拟当前请求收到未经授权的响应。
     * config：HTTP 客户端交给替身 adapter 的请求配置，用于回显响应和断言认证头。
     */
    adapter: async (config) => {
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, {}, { status: 401 })
    }
  })
  await assert.rejects(client.get('/example'), /Unauthorized/)
  assert.equal(cleared, 1)
})

/**
 * 断言浏览器无 Bridge 时明确失败，原生失败对象保持原状。
 */
test('native failures remain failures and browser-only mode is explicit', async () => {
  // failure：原生处理器返回的失败对象，断言必须原样传回调用者。
  const failure = { ok: false, code: 'NOT_SUPPORTED' }
  assert.deepEqual(await callNative('example', {}, { host: {} }), {
    ok: false,
    code: 'BRIDGE_UNAVAILABLE'
  })
  assert.equal(
    await callNative(
      'example',
      {},
      {
        host: {
          flutter_inappwebview: {
            /**
             * 模拟原生侧返回未支持的失败结果。
             */
            callHandler: async () => failure
          }
        }
      }
    ),
    failure
  )
})

/**
 * 断言永不回调的原生操作最终被超时解除等待。
 */
test('native call timeout releases the pending timer', async () => {
  await assert.rejects(
    callNative(
      'example',
      {},
      {
        timeout: 5,
        host: {
          flutter_inappwebview: {
            /**
             * 返回永不完成的原生处理 Promise。
             */
            callHandler: () =>
              new Promise(
                /**
                 * 故意不结算的执行器，用于覆盖超时路径。
                 */
                () => {}
              )
          }
        }
      }
    ),
    /timeout/
  )
})

/**
 * 断言卸载原生回调后恢复原来的宿主函数。
 */
test('native callback cleanup restores the previous owner', () => {
  // original：注册框架回调前由宿主持有的旧处理函数。
  const original =
    /**
     * 原生宿主已有回调，用于检查清理后的引用一致性。
     */
    () => 'original'
  // host：模拟原生回调命名空间，用例结束应恢复其原有拥有者。
  const host = { example: original }
  // received：框架回调最后收到的原生参数。
  let received
  // dispose：移除本次原生回调并恢复原拥有者的清理函数。
  const dispose = receiveNative(
    'example',
    /**
     * 记录原生侧传入的数据。
     * value：模拟原生侧推送给回调的参数。
     */
    (value) => {
      received = value
    },
    host
  )
  host.example(42)
  assert.equal(received, 42)
  dispose()
  assert.equal(host.example, original)
})

/**
 * 断言协议相对的站外历史触发站内兜底。
 */
test('safe back rejects protocol-relative external history', async () => {
  // fallback：安全返回实际交给 router.replace 的站内目标。
  let fallback
  // router：受控路由替身，危险历史不得触发 back。
  const router = {
    options: { history: { state: { back: '//external.invalid' } } },
    /**
     * 危险历史若调用 back 则立即让用例失败。
     */
    back: () => assert.fail('must not leave the site'),
    /**
     * 记录框架选择的站内替代路由。
     * path：当前待校验的路由或请求路径。
     */
    replace: async (path) => {
      fallback = path
    }
  }
  assert.equal(await safeBack(router), false)
  assert.equal(fallback, '/')
})
