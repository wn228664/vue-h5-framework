<script setup>
import { computed, onActivated, onDeactivated, onScopeDispose, ref, watch } from 'vue'
import { VueCropper } from 'vue-cropper'
import { exportCropBlob } from '../../utils/image/exportCropBlob.js'
import 'vue-cropper/dist/index.css'
const props = defineProps({
  image: { type: String, required: true },
  ratio: { type: Array, default: () => [1, 1] }
})
const emit = defineEmits(['confirm', 'cancel'])
const cropper = ref(null)
const exporting = ref(false)
const ready = ref(false)
const error = ref('')
const ratio = computed(() =>
  props.ratio.length === 2 && props.ratio.every((value) => Number.isFinite(value) && value > 0)
    ? props.ratio
    : [1, 1]
)
let active = true
let operation
function cancelExport() {
  operation?.abort()
  operation = null
  exporting.value = false
}
watch(
  () => props.image,
  () => {
    cancelExport()
    ready.value = false
    error.value = ''
  }
)
watch(ratio, cancelExport)
onActivated(() => {
  active = true
})
onDeactivated(() => {
  active = false
  cancelExport()
})
onScopeDispose(() => {
  active = false
  operation?.abort()
})
function imageLoaded(status) {
  ready.value = status === 'success'
  error.value = ready.value ? '' : '图片加载失败，请重新选择'
}
async function confirm() {
  if (exporting.value || !ready.value || !cropper.value) return
  const current = new AbortController()
  operation = current
  exporting.value = true
  error.value = ''
  try {
    const blob = await exportCropBlob(cropper.value, { signal: current.signal })
    if (active && operation === current && !current.signal.aborted) emit('confirm', blob)
  } catch (failure) {
    if (active && !current.signal.aborted) error.value = failure.message
  } finally {
    if (active && operation === current) {
      operation = null
      exporting.value = false
    }
  }
}
function cancel() {
  cancelExport()
  emit('cancel')
}
</script>
<template>
  <div class="cropper">
    <div class="cropper-canvas">
      <VueCropper
        ref="cropper"
        :img="image"
        :fixed-number="ratio"
        auto-crop
        fixed
        center-box
        output-type="png"
        @img-load="imageLoaded"
      />
    </div>
    <p v-if="error" class="cropper-error" role="alert">{{ error }}</p>
    <div class="cropper-actions">
      <van-button @click="cancel">取消</van-button>
      <van-button :disabled="!ready || exporting" @click="cropper?.rotateRight()">旋转</van-button>
      <van-button type="primary" :disabled="!ready" :loading="exporting" @click="confirm"
        >确定</van-button
      >
    </div>
  </div>
</template>
<style scoped>
.cropper {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: min(70dvh, 540px);
  max-height: calc(90dvh - 40px);
}
.cropper-canvas {
  flex: 1;
  min-height: 0;
}
.cropper-error {
  flex: none;
  margin: 0;
  color: var(--van-danger-color);
}
.cropper-actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: var(--app-safe-area-bottom);
}
</style>
