<script setup>
defineProps({ title: String, content: String, btnText: { type: String, default: '确定' } })
const emit = defineEmits(['onClick'])
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
