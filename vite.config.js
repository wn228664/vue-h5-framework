/** 开发服务与发布构建配置。开关只读取当前 mode 的环境变量；认证代理目标由部署方显式提供，混淆默认关闭。 */
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { realpathSync } from 'fs'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from 'unplugin-vue-components/resolvers'
import { compression } from 'vite-plugin-compression2'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'
import JavaScriptObfuscator from 'javascript-obfuscator'

/**
 * 解析 env 布尔值
 * - 支持: true/false, 1/0, yes/no, on/off
 * @param {string|undefined} value
 * @param {boolean} fallback
 * @returns {boolean}
 *
 * 读取兼容 true/false、1/0、yes/no、on/off 的环境开关；未知值采用 fallback。
 * value：环境变量原始文本；非字符串时使用默认值。
 * fallback：开关缺失或无法识别时采用的默认值。
 */
function toBoolean(value, fallback) {
  if (typeof value !== 'string') return Boolean(fallback)
  // v：去掉空白并转成小写的开关文本。
  const v = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false
  return Boolean(fallback)
}

/**
 * 解析开发服务可读目录；依赖尚未安装时仍保留工程目录。
 */
function resolveDevFsAllowList() {
  // allow：开发服务允许读取的目录，包含工程和实际依赖目录。
  const allow = [__dirname]
  try {
    // nodeModulesRealPath：node_modules 链接解析后的真实路径，防止工作区依赖被 Vite 文件隔离拦截。
    const nodeModulesRealPath = realpathSync(resolve(__dirname, 'node_modules'))
    if (nodeModulesRealPath && !allow.includes(nodeModulesRealPath)) allow.push(nodeModulesRealPath)
  } catch {
    // ignore
  }
  return allow
}

/**
 * Rollup: 仅混淆应用 chunk（默认跳过 vendor）
 * @param {{ enabled: boolean, excludeChunkNames?: string[], options?: Record<string, any> }} params
 * @returns {import('vite').Plugin}
 *
 * 创建仅处理应用 JavaScript chunk 的混淆插件；失败交由 Rollup 报错。
 * params：混淆插件配置，包含启用状态、跳过的 chunk 名及上游混淆选项。
 */
function createObfuscatorPlugin(params) {
  // enabled：是否对本次构建应用混淆。
  const enabled = Boolean(params?.enabled)
  // excludeChunkNames：需要跳过的 chunk 名称，默认保留 vendor。
  const excludeChunkNames = Array.isArray(params?.excludeChunkNames)
    ? params.excludeChunkNames
    : ['vendor']
  // options：传给混淆器的选项；缺失时使用空对象。
  const options = params?.options && typeof params.options === 'object' ? params.options : {}

  return {
    name: 'framework:javascript-obfuscator',
    apply: 'build',
    enforce: 'post',
    /**
     * 按启用状态和 chunk 白名单处理产物，返回新代码或 null 表示跳过。
     * code：Rollup 产出的待处理 JavaScript 文本。
     * chunk：当前产物信息，用文件扩展名和 chunk 名决定是否跳过。
     */
    renderChunk(code, chunk) {
      if (!enabled) return null
      if (!chunk?.fileName || !chunk.fileName.endsWith('.js')) return null
      if (excludeChunkNames.includes(String(chunk?.name || ''))) return null

      try {
        // obfuscated：成功混淆后的代码；不生成错误的映射文件。
        const obfuscated = JavaScriptObfuscator.obfuscate(
          String(code || ''),
          options
        ).getObfuscatedCode()
        return { code: obfuscated, map: null }
      } catch (error) {
        // error：混淆器抛出的异常，通过 Rollup this.error 终止构建。

        this.error(error)
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig(
  /**
   * 按命令和环境模式组装插件、代理、源码别名与产物策略。
   * command：Vite 当前操作类型，只有 build 启用产物处理。
   * mode：环境文件模式，同时决定清理 console 的默认值。
   */
  ({ command, mode }) => {
    // env：当前模式下加载的构建与代理环境变量。
    const env = loadEnv(mode, process.cwd(), '')
    // isBuild：当前是否执行发布构建。
    const isBuild = command === 'build'
    // resolveAlias：源码目录别名，统一 @ 的解析入口。
    const resolveAlias = {
      '@': resolve(__dirname, 'src')
    }

    // enableCompress：是否输出 gzip 和 Brotli 压缩副本。
    const enableCompress = isBuild && toBoolean(env.VITE_BUILD_COMPRESS, true)
    // enableImageOptimize：是否处理导入图片及 public 目录图片。
    const enableImageOptimize = isBuild && toBoolean(env.VITE_BUILD_IMAGE_OPTIMIZE, true)
    // enableObfuscate：是否显式启用应用代码混淆。
    const enableObfuscate = isBuild && toBoolean(env.VITE_BUILD_OBFUSCATE, false)

    // enableDropConsole：是否移除 console 和 debugger，生产模式默认开启。
    const enableDropConsole =
      isBuild && toBoolean(env.VITE_BUILD_DROP_CONSOLE, mode === 'production')

    // plugins：当前构建启用的插件序列；过滤关闭项后交给 Vite。
    const plugins = [
      vue(),
      Components({
        resolvers: [VantResolver({ importStyle: 'css' })]
      }),

      // 构建产物压缩：输出 .gz / .br（需要部署侧支持 gzip_static / brotli_static 才会命中）
      enableCompress
        ? compression({
            algorithms: ['gzip', 'brotliCompress'],
            threshold: 10240
          })
        : null,

      // 图片自动压缩：处理 src 导入的图片 + public 目录静态图片（默认 includePublic=true）
      enableImageOptimize
        ? ViteImageOptimizer({
            logStats: false,
            ansiColors: true,
            includePublic: true,
            jpeg: { quality: 85 },
            jpg: { quality: 85 },
            png: { quality: 85 },
            webp: { quality: 85 },
            avif: { quality: 50 }
          })
        : null,

      // JS 混淆默认关闭，显式设置 VITE_BUILD_OBFUSCATE=true 后启用
      createObfuscatorPlugin({
        enabled: enableObfuscate,
        excludeChunkNames: ['vendor'],
        options: {
          compact: true,
          simplify: true,
          stringArray: true,
          rotateStringArray: true,
          stringArrayThreshold: 0.75,
          identifierNamesGenerator: 'hexadecimal',
          splitStrings: true,
          splitStringsChunkLength: 10,
          deadCodeInjection: false,
          debugProtection: false,
          controlFlowFlattening: false,
          selfDefending: false,
          renameGlobals: false,
          disableConsoleOutput: false,
          reservedStrings: ['\\.js$']
        }
      })
    ].filter(Boolean)

    return {
      plugins,
      resolve: {
        alias: resolveAlias,
        // 兼容旧 H5 的省略扩展名写法（如 import '@/components/NavigationBar'）
        extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
      },
      server: {
        port: 5174,
        host: '127.0.0.1',
        open: false,
        fs: {
          allow: resolveDevFsAllowList()
        },
        proxy: env.DEV_PROXY_TARGET
          ? {
              '/api': {
                target: env.DEV_PROXY_TARGET,
                changeOrigin: true,
                /**
                 * 移除代理路径中的 /api 前缀，保留剩余路径和查询。
                 * path：代理收到的 /api 路径，转发前移除该固定前缀。
                 */
                rewrite: (path) => path.replace(/^\/api/, '')
              }
            }
          : {}
      },
      esbuild: enableDropConsole
        ? {
            drop: ['console', 'debugger']
          }
        : undefined,
      build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: false,
        modulePreload: { polyfill: true },
        rollupOptions: {
          output: {
            /**
             * 将 node_modules 模块归入 vendor，其余模块采用默认拆包。
             * id：Rollup 模块标识，依赖模块统一归入 vendor。
             */
            manualChunks(id) {
              if (id.includes('node_modules')) return 'vendor'
            }
          }
        }
      }
    }
  }
)
