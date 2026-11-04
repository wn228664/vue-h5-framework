<script setup>
/** 框架首页：只展示可复用能力和入口，不读取业务身份、不调用业务接口；NavigationBar 统一处理安全区。 */

import NavigationBar from '../../components/NavigationBar.vue'
</script>
<template>
  <div>
    <NavigationBar title="首页" />
    <section class="page-content">
      <h1>Vue H5 Framework</h1>
      <p>应用已就绪。路由、状态管理和通用组件已接入。</p>
      <van-button type="primary" to="/components">查看通用组件</van-button>
    </section>
  </div>
</template>
