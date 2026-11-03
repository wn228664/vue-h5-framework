import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AxiosError } from 'axios'
import { createHttpClient } from '../src/api/httpClient.js'
import { callNative, receiveNative } from '../src/utils/bridge/index.js'
import { safeBack } from '../src/router/safeBack.js'

test('HTTP transports payloads without assuming a business success code', async () => {
  const client = createHttpClient({
    getSession: () => ({ token: 'test-token', revision: 1 }),
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

test('a delayed unauthorized response cannot clear a newer session', async () => {
  let revision = 1
  let cleared = 0
  const client = createHttpClient({
    getSession: () => ({ token: 'test-token', revision }),
    onUnauthorized: () => {
      cleared++
    },
    adapter: async (config) => {
      revision++
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, {}, { status: 401 })
    }
  })
  await assert.rejects(client.get('/example'), { code: 'SESSION_CHANGED' })
  assert.equal(cleared, 0)
})

test('current unauthorized responses clear the session and remain rejected', async () => {
  let cleared = 0
  const client = createHttpClient({
    onUnauthorized: () => {
      cleared++
    },
    adapter: async (config) => {
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, {}, { status: 401 })
    }
  })
  await assert.rejects(client.get('/example'), /Unauthorized/)
  assert.equal(cleared, 1)
})

test('native failures remain failures and browser-only mode is explicit', async () => {
  const failure = { ok: false, code: 'NOT_SUPPORTED' }
  assert.deepEqual(await callNative('example', {}, { host: {} }), {
    ok: false,
    code: 'BRIDGE_UNAVAILABLE'
  })
  assert.equal(
    await callNative(
      'example',
      {},
      { host: { flutter_inappwebview: { callHandler: async () => failure } } }
    ),
    failure
  )
})

test('native call timeout releases the pending timer', async () => {
  await assert.rejects(
    callNative(
      'example',
      {},
      { timeout: 5, host: { flutter_inappwebview: { callHandler: () => new Promise(() => {}) } } }
    ),
    /timeout/
  )
})

test('native callback cleanup restores the previous owner', () => {
  const original = () => 'original'
  const host = { example: original }
  let received
  const dispose = receiveNative(
    'example',
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

test('safe back rejects protocol-relative external history', async () => {
  let fallback
  const router = {
    options: { history: { state: { back: '//external.invalid' } } },
    back: () => assert.fail('must not leave the site'),
    replace: async (path) => {
      fallback = path
    }
  }
  assert.equal(await safeBack(router), false)
  assert.equal(fallback, '/')
})
