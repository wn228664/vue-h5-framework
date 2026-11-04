/**
 * 模块职责：创建应用唯一的 Pinia 根实例，供 Vue 安装与组件外服务共同使用。
 * 不要在请求/路由入口重新 createPinia，否则会读取另一份空会话；测试可显式创建独立实例。
 */
import { createPinia } from 'pinia'
// 共享实例必须先安装到应用，再由 router/request 消费；store 的延迟创建不等于持久化。
// pinia：应用级状态容器；生命周期与本页 Vue 应用一致。
export const pinia = createPinia()
