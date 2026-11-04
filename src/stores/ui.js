/**
 * 模块职责：管理 Vant 亮/暗主题及非敏感外观偏好，供根 ConfigProvider 消费。
 * 读取受限或数据无效时使用 light；写入失败保留当前主题，由交互页面反馈失败。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { readStorage, writeStorage } from '../utils/storage.js'

// useUiStore：非敏感外观 store 工厂；与共享 Pinia 绑定，不保存登录信息。
export const useUiStore = defineStore(
  'ui',
  /**
   * 恢复主题偏好，并提供先保存后发布的更新动作。
   */
  () => {
    // 主题只接受 light/dark；恢复失败或其它持久化值均沿用 light。
    // theme：light/dark 主题 ref；读取失败或持久化值非法时初值 light。
    const theme = ref(readStorage('theme') === 'dark' ? 'dark' : 'light')
    /**
     * 先持久化合法化后的主题，再更新视图，避免界面显示成功却无法保存。
     * @param {*} value 仅 dark 选择暗色，其余归一为 light。
     * @returns {boolean} true 表示偏好已写入；false 保留旧主题，调用方应提示重试。
     *
     * 保存合法主题；失败返回 false 且保持旧视图，成功更新 theme。
     * value：调用方的主题候选；只有 dark 选择深色，其余归 light。
     */
    function setTheme(value) {
      // 合法化后的候选值只在存储成功时发布。
      // next：由输入合法化的候选主题；存储成功前不发布到视图。
      const next = value === 'dark' ? 'dark' : 'light'
      if (!writeStorage('theme', next)) return false
      theme.value = next
      return true
    }
    return { theme, setTheme }
  }
)
