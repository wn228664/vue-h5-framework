<script setup>
/** 受控文本对话框。title/content 为可选文本，btnText 默认“确定”；默认插槽替换正文。v-model:show 默认 false，ref.show 保留兼容入口；onClick 在用户确认后发出，不表示远端任务成功。 */

defineProps({
  /** 属性 title：提示标题文本，未提供时由组件默认展示处理。 */
  title: String,

  /** 属性 content：提示正文文本，不按 HTML 渲染。 */
  content: String,

  /** 属性 btnText：确认按钮文字，默认“确定”。 */
  btnText: { type: String, default: '确定' }
})
// emit：发布无载荷的 onClick 确认事件；调用方负责异步任务与结果反馈。
const emit = defineEmits(['onClick'])
// show：双向绑定的弹窗可见性；父级与暴露的 ref.show 共享该值。
const show = defineModel('show', { type: Boolean, default: false })
// 保留 ref.show 用法；新页面优先 v-model:show，异步关闭使用 Vant before-close 属性。
defineExpose({ show })
</script>
<template>
  <van-dialog
    v-model:show="show"
    :title="title"
    :message="content"
    :confirm-button-text="btnText"
    @confirm="emit('onClick')"
    ><template v-if="$slots.default" #default><slot /></template
  ></van-dialog>
</template>
