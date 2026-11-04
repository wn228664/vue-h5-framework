<script setup>
/** 浏览器离线状态提示：navigator.onLine 只表达平台连接提示，不保证服务可达。监听归本组件所有，挂载注册 online/offline，卸载解除；组件不自动重试请求。 */

import { onBeforeUnmount, onMounted, ref } from 'vue'
// offline：初值取 navigator.onLine 的反值；仅网络事件更新，true 时显示状态条。
const offline = ref(!navigator.onLine)
// update：online/offline 共用的同步监听器；读取平台当时的连接提示。
const update =
  /**
   * 将最新 navigator.onLine 映射成离线提示状态。
   */
  () => {
    offline.value = !navigator.onLine
  }
onMounted(
  /**
   * 挂载注册一对网络监听，不创建轮询。
   */
  () => {
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
  }
)
onBeforeUnmount(
  /**
   * 卸载解除同一函数引用，避免页面重建累积监听。
   */
  () => {
    window.removeEventListener('online', update)
    window.removeEventListener('offline', update)
  }
)
</script>
<template>
  <van-notice-bar
    v-if="offline"
    role="status"
    left-icon="warning-o"
    text="网络连接已断开，请检查网络设置"
  />
</template>
