/**
 * 模块职责：检查手写 JavaScript 与 Vue 模板的语义错误；排版交给 Prettier。
 * 浏览器、Node 配置和测试分别声明全局对象，避免前端误用 Node 能力仍能通过检查。
 * 生成目录不参与检查；新增文件默认纳入，不为单个问题关闭未定义或未使用变量规则。
 */
import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ['*.config.js', 'tests/**/*.js'],
    languageOptions: { globals: globals.node }
  },
  {
    rules: {
      // 路由目录以 index.vue 命名；组件职责由目录表达，保留既有命名方式。
      'vue/multi-word-component-names': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
]
