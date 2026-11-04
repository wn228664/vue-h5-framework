/** 本地日历日期工具。getToday 使用运行设备本地时区，不按 UTC 截取；结果用于展示，不承担服务端日期或支付结算契约。 */
// 获取今日日期yyyy-MM-dd
// getToday：无参日期格式化函数，每次调用重新采样本地时钟。
export const getToday =
  /**
   * 返回设备本地日历的 yyyy-MM-dd 文本，不修改传入状态。
   */
  () => {
    // day：本次调用的 Date 快照；年/月/日都从同一时刻读取。
    const day = new Date()
    // year：本地完整年份数值；不使用两位年份。
    const year = day.getFullYear()
    // month：getMonth()+1 后补足两位的 01..12 字符串。
    const month = String(day.getMonth() + 1).padStart(2, '0')
    // date：本地月内日，补足两位的 01..31 字符串。
    const date = String(day.getDate()).padStart(2, '0')
    return `${year}-${month}-${date}`
  }
