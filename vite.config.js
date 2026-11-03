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
 */
function toBoolean(value, fallback) {
  if (typeof value !== 'string') return Boolean(fallback)
  const v = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false
  return Boolean(fallback)
}

function resolveDevFsAllowList() {
  const allow = [__dirname]
  try {
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
 */
function createObfuscatorPlugin(params) {
  const enabled = Boolean(params?.enabled)
  const excludeChunkNames = Array.isArray(params?.excludeChunkNames)
    ? params.excludeChunkNames
    : ['vendor']
  const options = params?.options && typeof params.options === 'object' ? params.options : {}

  return {
    name: 'framework:javascript-obfuscator',
    apply: 'build',
    enforce: 'post',
    renderChunk(code, chunk) {
      if (!enabled) return null
      if (!chunk?.fileName || !chunk.fileName.endsWith('.js')) return null
      if (excludeChunkNames.includes(String(chunk?.name || ''))) return null

      try {
        const obfuscated = JavaScriptObfuscator.obfuscate(
          String(code || ''),
          options
        ).getObfuscatedCode()
        return { code: obfuscated, map: null }
      } catch (error) {
        this.error(error)
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isBuild = command === 'build'
  const resolveAlias = {
    '@': resolve(__dirname, 'src')
  }

  const enableCompress = isBuild && toBoolean(env.VITE_BUILD_COMPRESS, true)
  const enableImageOptimize = isBuild && toBoolean(env.VITE_BUILD_IMAGE_OPTIMIZE, true)
  const enableObfuscate = isBuild && toBoolean(env.VITE_BUILD_OBFUSCATE, false)

  const enableDropConsole = isBuild && toBoolean(env.VITE_BUILD_DROP_CONSOLE, mode === 'production')

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
              rewrite: (path) => path.replace(/^\/api/, '')
            }
          }
        : {},
      cors: true
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
          manualChunks(id) {
            if (id.includes('node_modules')) return 'vendor'
          }
        }
      }
    }
  }
})
