<script setup>
import { useRoute, useRouter } from 'vue-router'
const route = useRoute()
const router = useRouter()
</script>
<template>
  <main class="app-shell">
    <router-view v-slot="{ Component, route }">
      <keep-alive :max="10"
        ><component :is="Component" v-if="route.meta.keepAlive" :key="route.name"
      /></keep-alive>
      <component :is="Component" v-if="!route.meta.keepAlive" />
    </router-view>
    <van-tabbar
      :model-value="route.name"
      safe-area-inset-bottom
      placeholder
      @change="router.replace({ name: $event })"
    >
      <van-tabbar-item name="home" icon="home-o">首页</van-tabbar-item>
      <van-tabbar-item name="components" icon="apps-o">组件</van-tabbar-item>
    </van-tabbar>
  </main>
</template>
