// 根字号不能再被转换成 rem，否则会与页面尺寸形成循环缩放。
export default {
  plugins: {
    'postcss-pxtorem': { rootValue: 37.5, propList: ['*'], selectorBlackList: [':root', '.norem'] }
  }
}
