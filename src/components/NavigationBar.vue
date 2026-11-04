<script setup>
/** 安全区导航栏：title 默认空串，back 控制左侧返回箭头；right 插槽供父级放工具按钮。返回使用 safeBack，直接打开且无站内历史时替换到首页。 */

import { useRouter } from 'vue-router'
import { safeBack } from '../router/safeBack.js'
defineProps({
  /** 属性 title：导航标题，默认空串。 */
  title: {
    type: String,
    default: ''
  },

  /** 属性 back：是否显示左侧返回箭头，默认 false；使用安全站内返回。 */
  back: Boolean
})
// router：当前应用路由实例；返回动作交给 safeBack 校验站内历史与后备页。
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
