<script setup>
/** 返回顶部组件。props.target 是同步滚动目标读取器，缺省 window；threshold 默认 200 CSS 像素，严格大于才显示。watchEffect 在目标变化时解绑旧监听，卸载停止整个 effect；减少动态效果时立即滚动。 */

import { onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
// props：父级 target/threshold 配置，只读；target 可读取响应式 DOM ref。
const props = defineProps({
  /** 属性 target：可选滚动容器读取函数；缺失时使用窗口，容器监听随作用域清理。 */
  target: Function,
  /** 属性 threshold：显示按钮所需的滚动像素阈值，默认 200。 */
  threshold: { type: Number, default: 200 }
})
// visible：按钮可见状态，初值 false；由实际 scrollY/scrollTop 与 threshold 比较得到。
const visible = ref(false)
// activeTarget：本次 effect 已绑定的 Window/元素；用于读取高度和执行滚动。
let activeTarget
// update：被动 scroll 监听器；同步更新 visible，不创建定时任务。
const update =
  /**
   * 根据当前目标的滚动偏移刷新按钮可见性。
   */
  () => {
    visible.value =
      (activeTarget === window ? window.scrollY : activeTarget?.scrollTop || 0) > props.threshold
  }
/**
 * 滚回目标顶部；遵守系统减少动态效果设置。
 */
function scrollToTop() {
  activeTarget?.scrollTo({
    top: 0,
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  })
}
// stop：watchEffect 的停止句柄；挂载后赋值，卸载调用并触发解绑。
let stop
onMounted(
  /**
   * 挂载后建立可随 target ref 更新的滚动监听。
   */
  () => {
    // 默认页面滚动与弹层隔离；显式 target 可跟随 DOM ref 更新。
    stop = watchEffect(
      /**
       * 为本轮滚动目标注册被动监听并立即同步状态。
       * onCleanup：Vue effect 清理注册器；目标改变或 effect 停止时移除当前 scroll 监听。
       */
      (onCleanup) => {
        // current：本轮解析的滚动目标；清理闭包必须绑定它而不是后来的 activeTarget。
        const current = props.target?.() || window
        activeTarget = current
        current.addEventListener('scroll', update, { passive: true })
        update()
        onCleanup(
          /**
           * 只移除本轮 current 上的监听，避免解绑后来目标。
           */
          () => current.removeEventListener('scroll', update)
        )
      }
    )
  }
)
onBeforeUnmount(
  /**
   * 卸载停止 effect，使最后一个目标的监听也被清理。
   */
  () => stop?.()
)
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
