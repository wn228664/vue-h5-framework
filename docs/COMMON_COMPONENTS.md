# H5 通用封装

本工程只提供架构、通用能力与可删除的本地验证页，不包含业务接口、成功码、域名或原生业务协议。

## 网络、状态与路由

| 入口 | 契约与调用方责任 |
| --- | --- |
| `src/api/httpClient.js` | `createHttpClient({ baseURL, getSession, onUnauthorized, adapter })` 返回 Axios 实例，成功时直接返回 `response.data`。默认超时 30 秒。认证请求只接收相对路径，禁止覆盖实例 baseURL；超时、取消与 HTTP 错误交给调用方展示。 |
| `src/api/request.js` | 注入当前 Pinia 会话，当前会话 401 清理会话；旧会话的成功和失败统一拒绝为 `SESSION_CHANGED`，避免旧请求污染新登录。 |
| `src/stores/session.js` | `setSession({ token, permissions })`、`clear()` 管理内存凭证、权限与 revision。permissions 仅保留字符串，不将凭证写入 localStorage。 |
| `src/stores/ui.js` | `setTheme('light' / 'dark')` 保存外观。持久化失败返回 false，并保留旧外观，页面应展示失败提示。 |
| `src/router/` | 懒加载、认证与权限守卫、403/404、`meta.keepAlive` 缓存。`safeBack(router, fallback)` 只返回站内历史，直接打开时 replace 到后备页。 |
| `src/utils/storage.js` | 带 `h5-framework:` 前缀的 JSON 偏好存储；读取失败返回 fallback，写入失败返回 false。用于非敏感偏好。 |

```js
const controller = new AbortController()
const payload = await request.get('/items', { signal: controller.signal })
// 页面离开或新请求替代旧请求时调用 controller.abort()。
```

`authenticated: false` 用于公开传输，不自动附加凭证、不触发当前会话清理；配置跨站请求前由调用方确认目标。认证数据只在当前代次交付。请求层不自动重试写操作，也不解释服务端业务成功信封。

## 组件

| 组件 | 使用与生命周期 |
| --- | --- |
| `NavigationBar` | 标题、返回与右侧插槽；返回通过站内安全回退。 |
| `PopupTips` | `v-model:show`、title、content、btnText、默认插槽；保留 `ref.show` 和 `onClick` 确认事件。异步提交使用 Vant `before-close` 属性，由调用方管理提交锁、失败反馈和关闭。 |
| `ImageCropper` | 必填 image Data URL，ratio 默认 `[1, 1]`，`confirm` 输出非空 Blob，`cancel` 关闭。图像就绪后才允许确认；导出防重，默认 5 秒超时，错误在组件内展示。图片或比例变化、停用、销毁均使旧导出失效。 |
| `LoadingTransition` | 纯展示层，挂载默认显示；ref 的 `show()` / `hide()` 保留。父组件管理请求、计时器与结束，主题色随 Vant，支持 reduced-motion。 |
| `NetworkOffline` | 根据浏览器 online/offline 事件提示连接状态，销毁时注销；不证明互联网或服务端可达。 |
| `BackToTop` | 默认监听 window，threshold 默认 200；`target: () => HTMLElement` 可绑定组件滚动容器，并跟随响应式 DOM ref 更新。目标替换和卸载均移除旧监听。 |

```vue
<PopupTips v-model:show="visible" title="提示" content="通用说明" />
<ImageCropper :image="dataUrl" :ratio="[1, 1]" @confirm="consumeBlob" @cancel="close" />
<BackToTop :target="() => scrollElement" />
```

H5 普通页面保留移动网页自然滚动；弹窗消息区内部滚动，底部裁剪弹层限制在 90dvh 内，画布收缩而操作按钮保留。管理端的整页禁止滚动规则由管理端框架单独落实。验证页在 KeepAlive 停用时取消图片读取、清理加载计时器、关闭弹层。

## 图片、Bridge 与浏览器能力

- `normalizeImageFileToDataUrl(file, { signal, maxEdge, quality, type, retries, retryDelayMs })`：接受非空、最大 20MB 的 Blob，优先使用 createImageBitmap 校正方向并缩放，结束后释放位图。maxEdge 最大 8192，quality 限制到 0..1，仅临时 NotFoundError 有限重试。无位图能力时回退 FileReader 原图读取，缩放不作强保证；调用方仍需验证输出类型、文件大小和服务端规则。
- `exportCropBlob(cropper, { signal, timeoutMs })`：包装裁剪回调，拒绝空输出、取消和超时。`withCancellation` 同步清理计时器与监听；底层不支持取消时只停止消费迟到结果。
- `callNative(name, payload, { signal, timeout, host })`：封装 Flutter InAppWebView callHandler，默认 5 秒超时；浏览器返回 `{ ok: false, code: 'BRIDGE_UNAVAILABLE' }`，原生 `ok:false` 原样返回。ok 只表示传输状态，业务结果由调用方解释。没有内置业务 handler。
- `receiveNative(name, listener, host)`：返回注销函数，卸载时必须调用；允许乱序注销，不恢复已注销回调，不覆盖外部新 owner。拒绝原型名称或占用的非函数字段。同名多次注册仅当前栈顶接收。
- `copyToClipboard(text)`：现代 Clipboard API 优先，失败回退 execCommand；返回 boolean，临时 textarea 始终清理并恢复原焦点。真实浏览器的权限和用户手势由调用方处理。
- `fullscreen.js`：保留能力检测、进入/退出、当前元素、移动环境与独立显示模式判断。进入/退出返回 Promise，被浏览器拒绝时调用方恢复按钮并反馈；UA 推断只能用于提示，不能当权限判断。
- `date.js`、`envFlags.js`：保留日期格式化与环境开关，不包含业务常量。

Bridge 的超时与取消不代表原生副作用已撤销；写操作仍需宿主按实际服务实现幂等。

## 安全区与构建

`data-app-safe-area-mode` 为 all / top-only / bottom-only / none，默认 all；宿主已经处理某侧安全区时选择对应模式，避免双重 padding。NavigationBar、底栏与弹层使用同一组 CSS 变量。

根字号 37.5px，px-to-rem 不转换 `:root`；保留 Vant 按需导入、gzip/brotli、图片优化和默认关闭的可选混淆。生产服务器配置 history 回退。Node.js 最低 22.12，所有 npm 版本由锁文件固定。

## 验证

`npm run verify`：20 项测试与生产构建。覆盖旧会话、跨站凭证边界、公开请求、Bridge 注销/取消/超时、图片释放、剪贴板清理、全屏拒绝、主题失败。浏览器额外检查缓存、主题、裁剪、长弹窗、加载层、安全区及 320 / 390 / 768 / 1280 宽度和横屏；这些结果不替代未来业务后端或真实原生宿主验收。
