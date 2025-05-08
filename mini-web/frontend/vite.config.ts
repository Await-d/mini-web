import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react({
    // 禁用装饰器提案的使用，解决一些语法兼容性问题
    tsDecorators: false,
    // 设置更宽松的解析选项
    jsxImportSource: 'react'
  })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    hmr: {
      overlay: true, // 启用HMR错误覆盖层，方便调试
    },
    // 增加错误信息显示
    cors: true,
    // 提高开发服务器响应能力
    watch: {
      usePolling: true,
      interval: 1000,
    }
  },
  // 增加构建优化选项
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,  // 保留控制台日志便于调试
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons']
        }
      }
    }
  },
  // 增加JSX和TS错误容忍度
  esbuild: {
    logOverride: { 
      'this-is-undefined-in-esm': 'silent',
      'commonjs-variables-before-imports': 'silent'
    }
  }
})
