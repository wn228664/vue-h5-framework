import { withCancellation } from '../cancellation.js'

/** Canvas 导出可能不回调或返回 null；超时/取消后不得继续交付旧图片。 */
export function exportCropBlob(cropper, options) {
  return withCancellation(
    () =>
      new Promise((resolve, reject) => {
        cropper.getCropBlob((blob) => {
          if (!(blob instanceof Blob) || blob.size === 0) reject(new Error('图片导出失败，请重试'))
          else resolve(blob)
        })
      }),
    { timeoutMessage: '图片导出超时，请重试', ...options }
  )
}
