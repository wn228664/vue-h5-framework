/** 覆盖身份、Bridge、图片、全屏、复制和偏好的生命周期；迟到结果必须被隔离，临时资源在清理阶段释放。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AxiosError } from 'axios'
import { createPinia } from 'pinia'
import { createHttpClient } from '../src/api/httpClient.js'
import { useUiStore } from '../src/stores/ui.js'
import { useSessionStore } from '../src/stores/session.js'
import { callNative, receiveNative } from '../src/utils/bridge/index.js'
import { exportCropBlob } from '../src/utils/image/exportCropBlob.js'
import { normalizeImageFileToDataUrl } from '../src/utils/image/normalizeImageFileToDataUrl.js'
import { canRequestFullscreen, exitFullscreen } from '../src/utils/fullscreen.js'
import { copyToClipboard } from '../src/utils/clipboard.js'

// response：保留原请求配置的成功响应工厂，供多个本地 adapter 复用。
const response =
  /**
   * 生成保持请求 config 的旧身份成功响应。
   * config：HTTP 客户端交给替身 adapter 的请求配置，用于回显响应和断言认证头。
   */
  (config) => ({
    data: 'old data',
    status: 200,
    headers: {},
    statusText: 'OK',
    config
  })
/**
 * 断言成功的旧会话响应同样不能污染新身份。
 */
test('an old successful response cannot overwrite the current session', async () => {
  // revision：可变会话版本，用于模拟请求执行期间发生身份切换。
  let revision = 1
  // client：当前用例独占的 HTTP 客户端，adapter 为本地替身，不发送真实请求。
  const client = createHttpClient({
    /**
     * 返回可变版本的测试身份。
     */
    getSession: () => ({ token: 'fixture', revision }),
    /**
     * 推进身份版本后返回旧数据。
     * config：HTTP 客户端交给替身 adapter 的请求配置，用于回显响应和断言认证头。
     */
    adapter: async (config) => {
      revision++
      return response(config)
    }
  })
  await assert.rejects(client.get('/example'), { code: 'SESSION_CHANGED' })
})
/**
 * 断言绝对路径、危险路径和覆盖 API 基址都在传输前拒绝。
 */
test('credentials cannot be sent through absolute or replacement API bases', async () => {
  // sent：替身传输实际执行次数，非法请求必须在进入 adapter 前被拦截。
  let sent = 0
  // client：当前用例独占的 HTTP 客户端，adapter 为本地替身，不发送真实请求。
  const client = createHttpClient({
    /**
     * 记录 adapter 被调用的次数并返回受控响应。
     * config：HTTP 客户端交给替身 adapter 的请求配置，用于回显响应和断言认证头。
     */
    adapter: async (config) => {
      sent++
      return response(config)
    }
  })
  // path：当前待校验的路由或请求路径。
  for (const path of [
    '//external.invalid',
    'https://external.invalid',
    '/\\external.invalid',
    ' /example'
  ])
    await assert.rejects(client.get(path), { code: 'INVALID_PATH' })
  await assert.rejects(client.get('/example', { baseURL: 'https://external.invalid' }), {
    code: 'INVALID_PATH'
  })
  assert.equal(sent, 0)
})
/**
 * 断言公开请求不带认证头，公开 401 不能清理已登录会话。
 */
test('public requests neither attach session credentials nor clear an authenticated session', async () => {
  // cleared：清理认证状态回调的执行次数，用于排除误清除新会话。
  let cleared = 0
  // client：当前用例独占的 HTTP 客户端，adapter 为本地替身，不发送真实请求。
  const client = createHttpClient({
    /**
     * 提供公开请求测试前存在的登录身份。
     */
    getSession: () => ({ token: 'fixture', revision: 1 }),
    /**
     * 记录被测代码是否误清除会话。
     */
    onUnauthorized: () => cleared++,
    /**
     * 检查公开请求无认证头，并按 URL 返回成功或 401。
     * config：HTTP 客户端交给替身 adapter 的请求配置，用于回显响应和断言认证头。
     */
    adapter: async (config) => {
      assert.equal(config.headers.Authorization, undefined)
      if (config.url === '/public401')
        throw new AxiosError('Unauthorized', 'HTTP_ERROR', config, {}, { status: 401 })
      return response(config)
    }
  })
  assert.equal(await client.get('/public', { authenticated: false }), 'old data')
  await assert.rejects(client.get('/public401', { authenticated: false }), { code: 'HTTP_ERROR' })
  assert.equal(cleared, 0)
})
/**
 * 断言会话注入只接受合规 token 和权限列表。
 */
test('session injection normalizes permission input instead of accepting arbitrary values', () => {
  // session：独立 Pinia 容器内的会话 store，避免用例互相影响。
  const session = useSessionStore(createPinia())
  session.setSession({ token: 123, permissions: 'anything' })
  assert.equal(session.authenticated, false)
  assert.deepEqual(session.permissions, [])
  session.setSession({ token: 'fixture', permissions: ['read', null] })
  assert.deepEqual(session.permissions, ['read'])
  session.clear()
  assert.equal(session.revision, 3)
})
/**
 * 断言任意顺序清理 Bridge 订阅都不会复活失效回调。
 */
test('native callback disposal in either order never resurrects an inactive callback', () => {
  // host：模拟原生宿主回调命名空间。
  const host = {
    /**
     * 宿主原有回调，用引用比较验证最后恢复。
     */
    onExample: () => 'original'
  }
  // original：宿主注册框架回调前的函数引用。
  const original = host.onExample
  // called：框架原生回调实际执行次数。
  let called = 0
  // first：第一层 Bridge 回调的清理函数。
  const first = receiveNative(
    'onExample',
    /**
     * 记录第一层注册回调的执行。
     */
    () => called++,
    host
  )
  // staleCallback：首层注册时的回调引用，清理后即使被持有也不应执行。
  const staleCallback = host.onExample
  // second：第二层 Bridge 回调的清理函数。
  const second = receiveNative(
    'onExample',
    /**
     * 记录第二层注册回调的执行。
     */
    () => called++,
    host
  )
  first()
  staleCallback()
  assert.equal(called, 0)
  host.onExample()
  assert.equal(called, 1)
  second()
  assert.equal(host.onExample, original)
})
/**
 * 断言外部替换的 Bridge 回调保留，并拒绝保留对象属性名。
 */
test('native callbacks preserve external replacement and reject reserved object names', () => {
  // host：模拟原生宿主回调命名空间。
  const host = {}
  // close：本次 Bridge 注册的清理函数。
  const close = receiveNative(
    'onExample',
    /**
     * 本次注册的空处理器，仅验证清理所有权。
     */
    () => {},
    host
  )
  // external：框架注册之后由外部代码替换的回调，清理时不能覆盖。
  const external =
    /**
     * 外部代码安装的处理器，仅验证框架不覆盖它。
     */
    () => {}
  host.onExample = external
  close()
  assert.equal(host.onExample, external)
  assert.throws(
    /**
     * 尝试注册保留名称，预期同步抛 TypeError。
     */
    () =>
      receiveNative(
        'constructor',
        /**
         * 保留名注册使用的空回调，预期不会安装。
         */
        () => {},
        host
      ),
    TypeError
  )
})
/**
 * 断言预先取消时既不等待 Bridge，也不调用原生。
 */
test('abort releases native waiters and does not invoke an already canceled request', async () => {
  // controller：用例控制的取消信号，用于验证等待中的调用能及时退出。
  const controller = new AbortController()
  controller.abort()
  // calls：原生调用实际执行次数，预先取消时必须保持零。
  let calls = 0
  await assert.rejects(
    callNative(
      'example',
      {},
      {
        signal: controller.signal,
        host: {
          flutter_inappwebview: {
            /**
             * 记录原生调用次数，预期为零。
             */
            callHandler: () => calls++
          }
        }
      }
    ),
    { name: 'AbortError' }
  )
  assert.equal(calls, 0)
})
/**
 * 断言裁剪导出空值、超时和取消都以失败结算。
 */
test('crop output rejects missing data, timeout and canceled callbacks', async () => {
  await assert.rejects(
    exportCropBlob({
      /**
       * 立即回调 null 以模拟裁剪器导出失败。
       * callback：裁剪器保存的回调入口，取消后注入迟到 Blob。
       */
      getCropBlob: (callback) => callback(null)
    }),
    /导出失败/
  )
  await assert.rejects(
    exportCropBlob(
      {
        /**
         * 故意不回调以触发导出超时。
         */
        getCropBlob() {}
      },
      { timeoutMs: 5 }
    ),
    /超时/
  )
  // controller：用例控制的取消信号，用于验证等待中的调用能及时退出。
  const controller = new AbortController()
  // callback：裁剪器保存的回调入口，取消后注入迟到 Blob。
  let callback
  // pending：尚未结算的被测操作，用于断言取消、超时或迟到回调。
  const pending = exportCropBlob(
    {
      /**
       * 保存裁剪回调，供取消后模拟迟到结果。
       * value：裁剪器收到的导出回调，用于保存后续完成入口。
       */
      getCropBlob: (value) => {
        callback = value
      }
    },
    { signal: controller.signal }
  )
  controller.abort()
  callback(new Blob(['late']))
  await assert.rejects(pending, { name: 'AbortError' })
})
/**
 * 断言 canvas 转换失败时位图关闭且回退读取仍可成功。
 * t：Node 测试上下文，用 after 登记恢复全局对象的清理动作。
 */
test('image bitmap resources close even when canvas conversion fails', async (t) => {
  // saved：浏览器全局对象的原始属性描述符，供用例结束后精确还原。
  const saved = ['createImageBitmap', 'document', 'FileReader'].map(
    /**
     * 保存将替换的浏览器全局属性。
     * key：被临时替换的浏览器全局对象名称。
     */
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]
  )
  t.after(
    /**
     * 用例结束后恢复全部浏览器替身。
     */
    () =>
      saved.forEach(
        /**
         * 根据原描述符还原全局属性。
         * key：被临时替换的浏览器全局对象名称。
         * descriptor：替换前的全局属性描述符；不存在时清理阶段删除临时属性。
         */
        ([key, descriptor]) =>
          descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
      )
  )
  // closed：图片位图 close 的调用次数，用于断言迟到或失败资源得到释放。
  let closed = 0
  globalThis.createImageBitmap =
    /**
     * 创建带可观测 close 的位图替身。
     */
    async () => ({
      width: 100,
      height: 50,

      /**
       * 记录位图资源被关闭的次数。
       */
      close: () => closed++
    })
  globalThis.document = {
    /**
     * 创建只实现本次失败路径的画布替身。
     */
    createElement: () => ({
      /**
       * 返回绘制时会拒绝的二维上下文替身。
       */
      getContext: () => ({
        /**
         * 模拟 canvas 绘制异常，触发图片回退路径。
         */
        drawImage: () => {
          throw Error('draw failed')
        }
      })
    })
  }
  globalThis.FileReader = class {
    /**
     * 模拟 FileReader 成功读取并调用 onload。
     */
    readAsDataURL() {
      this.result = 'data:image/png;base64,AA=='
      this.onload()
    }
  }
  assert.match(await normalizeImageFileToDataUrl(new Blob(['image'])), /^data:image/)
  assert.equal(closed, 1)
})
/**
 * 断言图片在预先取消时立即以 AbortError 拒绝。
 */
test('image reads stop immediately when canceled before decoding', async () => {
  // controller：用例控制的取消信号，用于验证等待中的调用能及时退出。
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    normalizeImageFileToDataUrl(new Blob(['image']), { signal: controller.signal }),
    { name: 'AbortError' }
  )
})
/**
 * 断言不支持和平台拒绝的全屏操作都不会报告成功。
 */
test('fullscreen reports unsupported or denied operations without claiming success', async () => {
  assert.equal(canRequestFullscreen({}), false)
  await assert.rejects(exitFullscreen({}), /UNSUPPORTED/)
  await assert.rejects(
    exitFullscreen({
      /**
       * 模拟平台退出全屏时同步拒绝。
       */
      exitFullscreen: () => {
        throw Error('denied')
      }
    }),
    /denied/
  )
})
/**
 * 断言复制失败仍清理临时节点并恢复原焦点。
 * t：Node 测试上下文，用 after 登记恢复全局对象的清理动作。
 */
test('clipboard fallback cleans temporary DOM and restores focus on failure', async (t) => {
  // descriptor：替换前的全局属性描述符；不存在时清理阶段删除临时属性。
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  t.after(
    /**
     * 恢复用例覆盖前的 document 属性。
     */
    () =>
      descriptor
        ? Object.defineProperty(globalThis, 'document', descriptor)
        : delete globalThis.document
  )
  // removed：临时复制 DOM 被删除的次数。
  // restored：复制失败后恢复原焦点的次数。
  let removed = 0,
    restored = 0
  // body：受控 document.body 替身，记录临时节点的挂载和删除。
  const body = {
    /**
     * 记录临时节点挂载，提供删除路径的 parentNode。
     * element：被复制回退挂载的临时输入节点。
     */
    appendChild: (element) => {
      element.parentNode = body
    },
    /**
     * 记录临时 DOM 删除。
     */
    removeChild: () => removed++
  }
  globalThis.document = {
    body,
    activeElement: {
      isConnected: true,

      /**
       * 记录原焦点恢复。
       */
      focus: () => restored++
    },
    /**
     * 提供复制回退所需的最小文本输入替身。
     */
    createElement: () => ({
      style: {},
      /**
       * 属性设置空实现；本用例只验证失败清理。
       */
      setAttribute() {},
      /**
       * 临时输入聚焦空实现；原焦点恢复另行计数。
       */
      focus() {},
      /**
       * 选中文本空实现；实际复制由 execCommand 替身拒绝。
       */
      select() {},
      /**
       * 选区设置空实现；不模拟真实浏览器选择。
       */
      setSelectionRange() {}
    }),
    /**
     * 模拟浏览器拒绝复制操作。
     */
    execCommand: () => {
      throw Error('permission denied')
    }
  }
  assert.equal(await copyToClipboard('example'), false)
  assert.equal(removed, 1)
  assert.equal(restored, 1)
})

/**
 * 断言偏好写入失败保留当前主题并返回 false。
 * t：Node 测试上下文，用 after 登记恢复全局对象的清理动作。
 */
test('a failed preference save keeps the current theme and reports failure', (t) => {
  // descriptor：替换前的全局属性描述符；不存在时清理阶段删除临时属性。
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  t.after(
    /**
     * 恢复测试前的 localStorage 属性。
     */
    () =>
      descriptor
        ? Object.defineProperty(globalThis, 'localStorage', descriptor)
        : delete globalThis.localStorage
  )
  globalThis.localStorage = {
    /**
     * 模拟尚无主题持久化值。
     */
    getItem: () => null,
    /**
     * 模拟存储写入受阻。
     */
    setItem: () => {
      throw Error('storage blocked')
    }
  }
  // ui：独立 Pinia 容器内的主题 store，用于验证持久化失败不改变主题。
  const ui = useUiStore(createPinia())
  assert.equal(ui.setTheme('dark'), false)
  assert.equal(ui.theme, 'light')
})
