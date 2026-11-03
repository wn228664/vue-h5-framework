/** Vite 运行时开关只接受 1 / true，不将任意非空字符串当作启用。 */
export function isTruthyEnvFlag(value) {
  if (value == null) return false
  const s = String(value).trim()
  if (!s) return false
  if (s === '1') return true
  return s.toLowerCase() === 'true'
}
