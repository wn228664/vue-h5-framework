<!-- 纯展示过渡层，默认显示；父组件负责关闭及请求生命周期。 -->
<template>
  <div
    v-if="visible"
    class="loading-transition"
    :class="{ 'fade-in': visible }"
    role="status"
    aria-live="polite"
    aria-label="页面加载中"
  >
    <div class="loading-content">
      <div class="loading-spinner" aria-hidden="true"></div>
      <div class="loading-text">
        <div class="text-primary">加载中</div>
        <div class="text-secondary">请稍候</div>
      </div>
    </div>
  </div>
</template>

<script setup>
/** 展示加载遮罩，不启动请求、不决定业务超时。父组件可用 v-if 销毁，也可通过 ref.show()/hide() 控制；status/aria-live 向读屏提供加载反馈。 */

import { ref } from 'vue'

/** 过渡层是否显示。默认打开，交给父组件在准备完成后关闭。 */
// visible：实例内显示开关，初值 true；show/hide 直接控制，不携带网络状态。
const visible = ref(true)

/**
 * 显示本实例的加载遮罩；重复调用无额外副作用。
 */
function show() {
  visible.value = true
}

/**
 * 隐藏遮罩；请求取消和错误恢复仍由父级负责。
 */
function hide() {
  visible.value = false
}

defineExpose({
  show,
  hide
})
</script>

<style scoped src="./LoadingTransition.css"></style>
