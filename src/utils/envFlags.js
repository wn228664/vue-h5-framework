/**
 * 把 Vite 公开运行开关归一为布尔值，不把 false 字符串当启用。
 * value：运行时构建开关候选，可为空；只接受裁掉空白后的 1 或 true（忽略大小写）。
 */
export function isTruthyEnvFlag(value) {
  if (value == null) return false
  // s：转换并裁空白后的开关文本；空串和其它值均视为禁用。
  const s = String(value).trim()
  if (!s) return false
  if (s === '1') return true
  return s.toLowerCase() === 'true'
}
