<script setup>
/** 应用根：Vant 主题来自 ui；离线条与返回顶部独立于页面缓存。route.fullPath 变化时重建滚动监听，避免监听上一页的滚动目标。 */

import { useRoute } from 'vue-router'
import { useUiStore } from './stores/ui.js'
import NetworkOffline from './components/NetworkOffline/index.vue'
import BackToTop from './components/BackToTop/index.vue'
// ui：应用唯一的外观 store；theme 同步驱动 Vant Provider，不保存凭证。
const ui = useUiStore()
// route：Vue Router 的响应式路由；fullPath 变化使返回顶部组件重新绑定滚动目标。
const route = useRoute()
</script>
<template>
  <van-config-provider :theme="ui.theme">
    <NetworkOffline />
    <router-view />
    <BackToTop :key="route.fullPath" />
  </van-config-provider>
</template>
