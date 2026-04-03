import { resolve } from 'node:path'
import { defineConfig, presetWind3 } from 'unocss'

export default defineConfig({
  cli: {
    entry: {
      patterns: ['src/web/**/*.{html,ts}'],
      outFile: resolve(__dirname, 'src/web/views/uno.css')
    }
  },
  presets: [presetWind3()]
})
