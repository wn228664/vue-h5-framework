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
import { ref } from 'vue'

/** 过渡层是否显示。默认打开，交给父组件在准备完成后关闭。 */
const visible = ref(true)

/** 显示加载过渡层。 */
function show() {
  visible.value = true
}

/** 隐藏加载过渡层。 */
function hide() {
  visible.value = false
}

defineExpose({
  show,
  hide
})
</script>

<style scoped src="./LoadingTransition.css"></style>
