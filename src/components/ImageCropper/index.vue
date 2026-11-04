<script setup>
/** 图片裁剪组件：image 为必填 Data URL/可加载图片地址；ratio 为正数宽高比，缺省 [1,1]。confirm 事件只交付非空 PNG Blob；cancel 通知父级关闭。exporting 是本地互斥锁，图片/比例变化、停用与卸载中止结果等待；底层 canvas 已开始的导出不能撤销，迟到回调不得再发事件。 */

import { computed, onActivated, onDeactivated, onScopeDispose, ref, watch } from 'vue'
import { VueCropper } from 'vue-cropper'
import { exportCropBlob } from '../../utils/image/exportCropBlob.js'
import 'vue-cropper/dist/index.css'
import { getErrorMessage } from '../../utils/errors.js'
// props：父级只读 image/ratio；图片来源与可访问性由父级保证。
const props = defineProps({
  /** 属性 image：必填待裁剪图片源；改变时取消旧导出并重建裁剪器。 */
  image: { type: String, required: true },
  /** 属性 ratio：固定裁剪比例 [宽,高]，默认每实例独立 [1,1]；非法值在计算层回退。 */
  ratio: {
    type: Array,
    /**
     * 为每个组件实例创建独立的默认 1:1 比例数组。
     */
    default: () => [1, 1]
  }
})
// emit：发布 confirm(Blob) 或 cancel()；不执行上传或持久化。
const emit = defineEmits(['confirm', 'cancel'])
// cropper：VueCropper 模板引用，挂载前为 null；只在 ready 后调用导出/旋转。
const cropper = ref(null)
// exporting：导出等待互斥锁，初值 false；取消或所属任务 finally 解锁。
const exporting = ref(false)
// ready：img-load 的 success 标记；图片变化立即复位，加载成功前不能导出。
const ready = ref(false)
// error：当前有效周期的可公开错误文本；空串不展示提示。
const error = ref('')
// ratio：校验后的正数二元比例；非法值回退 [1,1]，不修改父级数组。
const ratio = computed(
  /**
   * 纯派生合法宽高比，拒绝非数组、非二元与非正数比例。
   */
  () =>
    Array.isArray(props.ratio) &&
    props.ratio.length === 2 &&
    props.ratio.every(
      /**
       * 逐边确认比例有限且大于零。
       * value：ratio 中待校验的一条比例边；必须是有限正数。
       */
      (value) => Number.isFinite(value) && value > 0
    )
      ? props.ratio
      : [1, 1]
)
// active：KeepAlive 可见周期标记；停用/卸载后禁止结果通知。
let active = true
// operation：当前导出 AbortController；切换图片或取消时终结并清空。
let operation
/**
 * 中止当前导出等待并释放互斥锁，迟到 Blob 不会重新交付。
 */
function cancelExport() {
  operation?.abort()
  operation = null
  exporting.value = false
}
watch(
  /**
   * 读取 image，作为图片切换的侦听源。
   */
  () => props.image,
  /**
   * 图片变化时取消旧导出并清空旧加载/错误状态。
   */
  () => {
    cancelExport()
    ready.value = false
    error.value = ''
  }
)
watch(ratio, cancelExport)
onActivated(
  /**
   * 缓存页激活后允许新导出结果交付。
   */
  () => {
    active = true
  }
)
onDeactivated(
  /**
   * 缓存页停用时禁止交付并中止等待。
   */
  () => {
    active = false
    cancelExport()
  }
)
onScopeDispose(
  /**
   * 卸载后禁止所有迟到结果写状态。
   */
  () => {
    active = false
    operation?.abort()
  }
)
/**
 * 将第三方加载状态映射为 ready 与公开错误文本。
 * status：VueCropper 的加载结果字符串；只有 success 才令 ready=true。
 */
function imageLoaded(status) {
  ready.value = status === 'success'
  error.value = ready.value ? '' : '图片加载失败，请重新选择'
}
/**
 * 同步占导出锁；仅当前可见周期发 confirm，失败保留可重试状态。
 */
async function confirm() {
  if (exporting.value || !ready.value || !cropper.value) return
  // current：本次导出身份；必须与 operation 相同且未中止才可写状态/发事件。
  const current = new AbortController()
  operation = current
  exporting.value = true
  error.value = ''
  try {
    // blob：已验证为非空的裁剪 Blob；仅交付给父级，不在组件内持久化。
    const blob = await exportCropBlob(cropper.value, { signal: current.signal })
    if (active && operation === current && !current.signal.aborted) emit('confirm', blob)
  } catch (failure) {
    // failure：导出拒绝值；仅当前可见任务可转为公开错误说明。

    if (active && operation === current && !current.signal.aborted)
      error.value = getErrorMessage(failure, '图片导出失败，请重试')
  } finally {
    if (active && operation === current) {
      operation = null
      exporting.value = false
    }
  }
}
/**
 * 先中止导出，再通知父级关闭裁剪弹层。
 */
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
