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

const response = (config) => ({
  data: 'old data',
  status: 200,
  headers: {},
  statusText: 'OK',
  config
})
test('an old successful response cannot overwrite the current session', async () => {
  let revision = 1
  const client = createHttpClient({
    getSession: () => ({ token: 'fixture', revision }),
    adapter: async (config) => {
      revision++
      return response(config)
    }
  })
  await assert.rejects(client.get('/example'), { code: 'SESSION_CHANGED' })
})
test('credentials cannot be sent through absolute or replacement API bases', async () => {
  let sent = 0
  const client = createHttpClient({
    adapter: async (config) => {
      sent++
      return response(config)
    }
  })
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
test('public requests neither attach session credentials nor clear an authenticated session', async () => {
  let cleared = 0
  const client = createHttpClient({
    getSession: () => ({ token: 'fixture', revision: 1 }),
    onUnauthorized: () => cleared++,
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
test('session injection normalizes permission input instead of accepting arbitrary values', () => {
  const session = useSessionStore(createPinia())
  session.setSession({ token: 123, permissions: 'anything' })
  assert.equal(session.authenticated, false)
  assert.deepEqual(session.permissions, [])
  session.setSession({ token: 'fixture', permissions: ['read', null] })
  assert.deepEqual(session.permissions, ['read'])
  session.clear()
  assert.equal(session.revision, 3)
})
test('native callback disposal in either order never resurrects an inactive callback', () => {
  const host = { onExample: () => 'original' }
  const original = host.onExample
  let called = 0
  const first = receiveNative('onExample', () => called++, host)
  const staleCallback = host.onExample
  const second = receiveNative('onExample', () => called++, host)
  first()
  staleCallback()
  assert.equal(called, 0)
  host.onExample()
  assert.equal(called, 1)
  second()
  assert.equal(host.onExample, original)
})
test('native callbacks preserve external replacement and reject reserved object names', () => {
  const host = {}
  const close = receiveNative('onExample', () => {}, host)
  const external = () => {}
  host.onExample = external
  close()
  assert.equal(host.onExample, external)
  assert.throws(() => receiveNative('constructor', () => {}, host), TypeError)
})
test('abort releases native waiters and does not invoke an already canceled request', async () => {
  const controller = new AbortController()
  controller.abort()
  let calls = 0
  await assert.rejects(
    callNative(
      'example',
      {},
      { signal: controller.signal, host: { flutter_inappwebview: { callHandler: () => calls++ } } }
    ),
    { name: 'AbortError' }
  )
  assert.equal(calls, 0)
})
test('crop output rejects missing data, timeout and canceled callbacks', async () => {
  await assert.rejects(exportCropBlob({ getCropBlob: (callback) => callback(null) }), /导出失败/)
  await assert.rejects(exportCropBlob({ getCropBlob() {} }, { timeoutMs: 5 }), /超时/)
  const controller = new AbortController()
  let callback
  const pending = exportCropBlob(
    {
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
test('image bitmap resources close even when canvas conversion fails', async (t) => {
  const saved = ['createImageBitmap', 'document', 'FileReader'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key)
  ])
  t.after(() =>
    saved.forEach(([key, descriptor]) =>
      descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
    )
  )
  let closed = 0
  globalThis.createImageBitmap = async () => ({ width: 100, height: 50, close: () => closed++ })
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        drawImage: () => {
          throw Error('draw failed')
        }
      })
    })
  }
  globalThis.FileReader = class {
    readAsDataURL() {
      this.result = 'data:image/png;base64,AA=='
      this.onload()
    }
  }
  assert.match(await normalizeImageFileToDataUrl(new Blob(['image'])), /^data:image/)
  assert.equal(closed, 1)
})
test('image reads stop immediately when canceled before decoding', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    normalizeImageFileToDataUrl(new Blob(['image']), { signal: controller.signal }),
    { name: 'AbortError' }
  )
})
test('fullscreen reports unsupported or denied operations without claiming success', async () => {
  assert.equal(canRequestFullscreen({}), false)
  await assert.rejects(exitFullscreen({}), /UNSUPPORTED/)
  await assert.rejects(
    exitFullscreen({
      exitFullscreen: () => {
        throw Error('denied')
      }
    }),
    /denied/
  )
})
test('clipboard fallback cleans temporary DOM and restores focus on failure', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  t.after(() =>
    descriptor
      ? Object.defineProperty(globalThis, 'document', descriptor)
      : delete globalThis.document
  )
  let removed = 0,
    restored = 0
  const body = {
    appendChild: (element) => {
      element.parentNode = body
    },
    removeChild: () => removed++
  }
  globalThis.document = {
    body,
    activeElement: { isConnected: true, focus: () => restored++ },
    createElement: () => ({
      style: {},
      setAttribute() {},
      focus() {},
      select() {},
      setSelectionRange() {}
    }),
    execCommand: () => {
      throw Error('permission denied')
    }
  }
  assert.equal(await copyToClipboard('example'), false)
  assert.equal(removed, 1)
  assert.equal(restored, 1)
})

test('a failed preference save keeps the current theme and reports failure', (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  t.after(() =>
    descriptor
      ? Object.defineProperty(globalThis, 'localStorage', descriptor)
      : delete globalThis.localStorage
  )
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {
      throw Error('storage blocked')
    }
  }
  const ui = useUiStore(createPinia())
  assert.equal(ui.setTheme('dark'), false)
  assert.equal(ui.theme, 'light')
})
