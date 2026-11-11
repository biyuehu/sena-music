import { resolve } from 'node:path'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve(import.meta.dirname, 'src/web/views'),
  publicDir: resolve(import.meta.dirname, 'public'),
  base: './',
  plugins: [
    UnoCSS({
      configFile: resolve(import.meta.dirname, 'uno.config.ts')
    })
  ],
  resolve: {
    alias: [
      { find: '@/romi/client', replacement: resolve(import.meta.dirname, 'src/framework/core/client.ts') },
      { find: '@/romi/web', replacement: resolve(import.meta.dirname, 'src/framework/web/index.ts') },
      { find: '@/romi/utils', replacement: resolve(import.meta.dirname, 'src/framework/utils') },
      { find: '@/romi', replacement: resolve(import.meta.dirname, 'src/framework/core/index.ts') },
      { find: '@', replacement: resolve(import.meta.dirname, 'src') }
    ]
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist/client'),
    emptyOutDir: true,
    target: 'esnext'
  }
})
