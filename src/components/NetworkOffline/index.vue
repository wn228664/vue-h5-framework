<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
const offline = ref(!navigator.onLine)
const update = () => {
  offline.value = !navigator.onLine
}
onMounted(() => {
  window.addEventListener('online', update)
  window.addEventListener('offline', update)
})
onBeforeUnmount(() => {
  window.removeEventListener('online', update)
  window.removeEventListener('offline', update)
})
</script>
<template>
  <van-notice-bar
    v-if="offline"
    role="status"
    left-icon="warning-o"
    text="网络连接已断开，请检查网络设置"
  />
</template>
