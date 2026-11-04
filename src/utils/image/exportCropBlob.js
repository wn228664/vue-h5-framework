import { withCancellation } from '../cancellation.js'

/**
 * 把回调式裁剪包装为有限等待的 Promise；拒绝空 Blob、取消和超时。
 * cropper：已就绪的 VueCropper 实例，须提供 getCropBlob(callback)。
 * options：透传 signal/timeoutMs/timeoutMessage；默认等待 5000ms，不取消底层 canvas 导出。
 */
export function exportCropBlob(cropper, options) {
  return withCancellation(
    /**
     * 延迟启动本轮 canvas 导出；已取消时不会执行。
     */
    () =>
      new Promise(
        /**
         * 桥接裁剪回调到 Promise，不在这里执行上传。
         * resolve：以非空 Blob 完成本次导出；外层控制取消与迟到交付。
         * reject：以无效 Blob/导出异常拒绝本次导出。
         */
        (resolve, reject) => {
          cropper.getCropBlob(
            /**
             * 校验输出 Blob 类型和非空性，非法输出保持失败。
             * blob：第三方回调给出的输出；必须为 Blob 且 size>0 才能交付。
             */
            (blob) => {
              if (!(blob instanceof Blob) || blob.size === 0)
                reject(new Error('图片导出失败，请重试'))
              else resolve(blob)
            }
          )
        }
      ),
    { timeoutMessage: '图片导出超时，请重试', ...options }
  )
}
