<script setup>
import { useRouter } from 'vue-router'
import { safeBack } from '../router/safeBack.js'
defineProps({ title: { type: String, default: '' }, back: Boolean })
const router = useRouter()
</script>
<template>
  <div class="navigation">
    <van-nav-bar :title="title" :left-arrow="back" @click-left="safeBack(router)">
      <template #right><slot name="right" /></template>
    </van-nav-bar>
  </div>
</template>
<style scoped>
.navigation {
  padding-top: var(--app-safe-area-top);
  background: var(--van-nav-bar-background);
}
</style>
