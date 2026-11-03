<script setup>
import { onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
const props = defineProps({ target: Function, threshold: { type: Number, default: 200 } })
const visible = ref(false)
let target
const update = () => {
  visible.value = (target === window ? window.scrollY : target?.scrollTop || 0) > props.threshold
}
function scrollToTop() {
  target?.scrollTo({ top: 0, behavior: 'smooth' })
}
let stop
onMounted(() => {
  // 默认页面滚动与弹层隔离；显式 target 可跟随 DOM ref 更新。
  stop = watchEffect((onCleanup) => {
    const current = props.target?.() || window
    target = current
    current.addEventListener('scroll', update, { passive: true })
    update()
    onCleanup(() => current.removeEventListener('scroll', update))
  })
})
onBeforeUnmount(() => stop?.())
</script>
<template>
  <button v-show="visible" class="back-to-top" aria-label="回到顶部" @click="scrollToTop">
    <van-icon name="back-top" />
  </button>
</template>
<style scoped>
.back-to-top {
  position: fixed;
  right: 16px;
  bottom: calc(76px + var(--app-safe-area-bottom));
  width: 44px;
  height: 44px;
  border: 1px solid #ddd;
  border-radius: 50%;
  background: var(--van-background-2);
  color: var(--van-text-color);
  z-index: 10;
}
</style>
