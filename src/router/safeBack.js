/**
 * 模块职责：为导航组件提供站内返回与直接打开时的后备跳转。
 * history.state.back 是 Vue Router 维护的提示，不是对浏览器真实历史的强鉴权；宿主不能任意伪造历史状态。
 * 拒绝协议相对、反斜杠、空白和控制字符路径；replace 的导航失败继续向调用方传播。
 *
 * 判断是否为允许的站内绝对路径文本，不发起导航。
 * @param {*} path 历史状态或后备页候选。
 * @returns {boolean} 允许 / 开头的本地路径，禁止浏览器可能按外部地址解释的分隔符。
 *
 * 识别可安全用于站内导航的绝对路径，不执行跳转。
 * path：历史/后备路径候选，只接受站内绝对路径文本。
 */
function isLocalPath(path) {
  return (
    typeof path === 'string' &&
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !/[\\\s\p{Cc}]/u.test(path)
  )
}

/**
 * 有合法站内历史提示时后退，否则替换当前记录，避免返回按钮再次进入同一后备页。
 * @param {import("vue-router").Router} router 当前应用路由器。
 * @param {string} [fallback=/] 必须是合法站内绝对路径，不接受外链或任意路由对象。
 * @returns {Promise<boolean>} true 表示已发起 back，false 表示已等待 replace；不保证历史后退已渲染完成。
 * 非法 fallback 抛 TypeError；路由跳转拒绝不伪装成成功。
 *
 * 存在合法站内历史则发起 back，否则等待 replace 到后备页；导航失败继续拒绝。
 * router：已安装的 Vue Router 实例；其 history.state.back 提供站内历史提示。
 * fallback：直接打开时使用的后备路径，默认 /；非法路径同步校验后拒绝。
 */
export async function safeBack(router, fallback = '/') {
  if (!isLocalPath(fallback)) throw new TypeError('Fallback must be a local absolute path')
  // 这里只消费 Router 自身历史提示；直接从外部打开通常没有站内 back。
  // back：读取到的 Router 历史提示；校验为本地路径后才调用 back。
  const back = router.options.history.state.back
  if (isLocalPath(back)) {
    router.back()
    return true
  }
  await router.replace(fallback)
  return false
}
