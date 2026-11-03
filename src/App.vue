<script setup>
import { useRoute } from 'vue-router'
import { useUiStore } from './stores/ui.js'
import NetworkOffline from './components/NetworkOffline/index.vue'
import BackToTop from './components/BackToTop/index.vue'
const ui = useUiStore()
const route = useRoute()
</script>
<template>
  <van-config-provider :theme="ui.theme">
    <NetworkOffline />
    <router-view />
    <BackToTop :key="route.fullPath" />
  </van-config-provider>
</template>
