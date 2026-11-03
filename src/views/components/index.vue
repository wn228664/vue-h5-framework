<script setup>
import { onActivated, onBeforeUnmount, onDeactivated, ref } from 'vue'
import { showFailToast, showToast } from 'vant'
import NavigationBar from '../../components/NavigationBar.vue'
import PopupTips from '../../components/PopupTips/index.vue'
import ImageCropper from '../../components/ImageCropper/index.vue'
import LoadingTransition from '../../components/LoadingTransition.vue'
import { normalizeImageFileToDataUrl } from '../../utils/image/normalizeImageFileToDataUrl.js'
import { copyToClipboard } from '../../utils/clipboard.js'
import { useUiStore } from '../../stores/ui.js'
const text = ref('')
const show = ref(false)
const ui = useUiStore()
const image = ref('')
const loading = ref(false)
let timer
let active = true
let reading
async function readImage({ file }) {
  reading?.abort()
  const current = new AbortController()
  reading = current
  try {
    const url = await normalizeImageFileToDataUrl(file, { maxEdge: 2048, signal: current.signal })
    if (active && reading === current && !current.signal.aborted) image.value = url
  } catch (error) {
    if (active && !current.signal.aborted) showFailToast(error.message)
  }
}
function updateTheme(value) {
  if (!ui.setTheme(value ? 'dark' : 'light')) showFailToast('无法保存外观偏好，请重试')
}
async function copyExample() {
  const copied = await copyToClipboard(text.value || 'Framework')
  if (active) (copied ? showToast : showFailToast)(copied ? '已复制' : '复制失败，请手动复制')
}
function showLoading() {
  loading.value = true
  clearTimeout(timer)
  timer = setTimeout(() => {
    loading.value = false
  }, 800)
}
function cropped() {
  image.value = ''
  showToast('裁剪完成')
}
function leave() {
  active = false
  reading?.abort()
  clearTimeout(timer)
  image.value = ''
  show.value = false
  loading.value = false
}
onActivated(() => {
  active = true
})
onDeactivated(leave)
onBeforeUnmount(leave)
</script>
<template>
  <div>
    <NavigationBar title="通用组件" />
    <section class="page-content">
      <van-cell-group inset>
        <van-field v-model="text" label="缓存输入" placeholder="切换页签后保留输入" />
        <van-cell title="深色主题"
          ><template #right-icon
            ><van-switch
              :model-value="ui.theme === 'dark'"
              aria-label="深色主题"
              @update:model-value="updateTheme" /></template
        ></van-cell>
      </van-cell-group>
      <div class="actions">
        <van-button @click="copyExample">复制文本</van-button>
        <van-button @click="showToast('提示组件正常')">显示提示</van-button
        ><van-button @click="show = true">打开弹窗</van-button>
      </div>
      <div class="actions">
        <van-button @click="showLoading">加载状态</van-button>
        <van-uploader :after-read="readImage" :preview-image="false" accept="image/png,image/jpeg"
          ><van-button>图片裁剪</van-button></van-uploader
        >
      </div>
      <van-empty description="暂无内容" />
      <PopupTips v-model:show="show" title="通用弹窗" content="可通过组件属性配置内容。" />
      <van-popup
        :show="Boolean(image)"
        position="bottom"
        round
        class="cropper-popup"
        @update:show="image = ''"
      >
        <ImageCropper v-if="image" :image="image" @confirm="cropped" @cancel="image = ''" />
      </van-popup>
      <LoadingTransition v-if="loading" />
    </section>
  </div>
</template>
<style scoped>
.cropper-popup {
  padding: 20px 16px;
  max-height: 90dvh;
  overflow: hidden;
}
</style>
