const prefix = 'h5-framework:'
export function readStorage(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(prefix + key)) ?? fallback
  } catch {
    return fallback
  }
}
export function writeStorage(key, value) {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}
