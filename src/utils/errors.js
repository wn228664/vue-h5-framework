/**
 * 模块职责：在用户反馈与诊断入口选择稳定的公开字段，不序列化原始错误或请求配置。
 * 文本选择不等于内容脱敏，服务层仍须保证 message 可以公开；日志投影仅保留字符串 name/code。
 *
 * 取得可以交给 Toast/文本节点的错误说明，异常 message 类型和空白文案回退默认值。
 * @param {*} error 原始拒绝值，可为文本或具有 message 字段的对象。
 * @param {string} [fallback=操作失败，请重试] 调用方确认可公开的默认文本。
 * @returns {string} 非空文本，不尝试 JSON.stringify 错误对象。
 *
 * 选取非空公开错误文本；对象、缺失和空白 message 使用 fallback。
 * error：任意原始拒绝值；只读取公开 message/name/code，不序列化请求或响应。
 * fallback：调用方确认可公开的默认文案，默认“操作失败，请重试”。
 */
export function getErrorMessage(error, fallback = '操作失败，请重试') {
  // `candidate`：原始字符串拒绝值或对象 message；只检查文本，不消费 config/response 等其它字段。
  // candidate：error 本身的字符串或其 message；仅非空文本可进入用户反馈。
  const candidate = typeof error === 'string' ? error : error?.message
  return typeof candidate === 'string' && candidate.trim() ? candidate : fallback
}

/**
 * 将诊断内容投影为类型与代码，拒绝对象字段，避免它们夹带凭证、请求或响应数据。
 * @param {*} error Vue 错误处理器或初始化 Promise 收到的原始失败。
 * @returns {{name: string, code: string|undefined}} 独立的公开投影，不持有原始错误引用。
 *
 * 返回新的 name/code 诊断投影，拒绝非字符串字段并断开原错误引用。
 * error：任意原始拒绝值；只读取公开 message/name/code，不序列化请求或响应。
 */
export function getErrorInfo(error) {
  return {
    name: typeof error?.name === 'string' ? error.name : 'Error',
    code: typeof error?.code === 'string' ? error.code : undefined
  }
}
