import { defineStore } from 'pinia'
import { ref } from 'vue'
import { readStorage, writeStorage } from '../utils/storage.js'

export const useUiStore = defineStore('ui', () => {
  const theme = ref(readStorage('theme') === 'dark' ? 'dark' : 'light')
  function setTheme(value) {
    const next = value === 'dark' ? 'dark' : 'light'
    if (!writeStorage('theme', next)) return false
    theme.value = next
    return true
  }
  return { theme, setTheme }
})
