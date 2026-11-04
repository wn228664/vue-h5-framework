/** 启动临时 Vite 实例验证开发 CORS；仅绑定回环地址，finally 关闭监听器。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

/**
 * 验证站外网页不能跨源读取开发源码，同时保留本机回环联调。
 */
test(
  'development CORS accepts loopback origins and does not expose source to arbitrary sites',
  { timeout: 15000 },
  async () => {
    // server：临时 Vite 开发实例，使用随机端口避免碰撞现有服务。
    const server = await createServer({
      root: fileURLToPath(new URL('..', import.meta.url)),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, strictPort: true }
    })
    try {
      await server.listen()
      // url：临时服务实际分配的回环访问地址。
      const url = `http://127.0.0.1:${server.httpServer.address().port}/`
      // external：伪装为站外 Origin 的响应，不应携带允许该 Origin 的头。
      const external = await fetch(url, { headers: { Origin: 'https://untrusted.invalid' } })
      assert.equal(external.headers.get('access-control-allow-origin'), null)
      // localOrigin：允许用于本地联调的 localhost 来源。
      const localOrigin = 'http://localhost:8080'
      // local：携带允许的回环 Origin 的响应。
      const local = await fetch(url, { headers: { Origin: localOrigin } })
      assert.equal(local.headers.get('access-control-allow-origin'), localOrigin)
    } finally {
      await server.close()
    }
  }
)
