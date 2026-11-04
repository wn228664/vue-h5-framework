<script setup>
/** 首页/组件页签布局。route.name 驱动 tabbar，切换使用 replace 避免堆叠浏览历史；keepAlive 元数据决定缓存，缓存上限 10 个命名页。router-view 的 Component 是当前视图，插槽 route 决定该视图的缓存键。 */

import { useRoute, useRouter } from 'vue-router'
// route：响应式当前路由；name 同步底栏选中项。
const route = useRoute()
// router：应用路由器；页签事件按命名路由 replace，不从文案推断路径。
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
