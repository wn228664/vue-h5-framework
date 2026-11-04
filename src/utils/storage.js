/** 仅用于非敏感偏好。所有键使用 h5-framework: 命名空间，JSON 存取受浏览器隐私模式/额度限制；异常转为 fallback/false，不伪造写入成功。 */
// prefix：框架固定键前缀；隔离同源其它应用的普通偏好，不能当加密。
const prefix = 'h5-framework:'
/**
 * 读取并解析命名空间偏好；缺失或异常返回 fallback，不向外抛存储异常。
 * key：调用方提供的偏好键；内部拼接 prefix，不写 token 等敏感数据。
 * fallback：读取缺失、JSON 无效、null 或存储受限时返回的值，默认 null。
 */
export function readStorage(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(prefix + key)) ?? fallback
  } catch {
    return fallback
  }
}
/**
 * 序列化并写偏好；完成返回 true，序列化/额度/权限异常返回 false。
 * key：调用方提供的偏好键；内部拼接 prefix，不写 token 等敏感数据。
 * value：待 JSON 序列化的非敏感偏好；循环引用等序列化异常返回 false。
 */
export function writeStorage(key, value) {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}
