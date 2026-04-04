import { resolve } from 'node:path'
import { extractorArbitraryVariants } from '@unocss/extractor-arbitrary-variants'
import { defineConfig, presetIcons, presetWind3 } from 'unocss'

export default defineConfig({
  cli: {
    entry: {
      patterns: ['**/*.{html,ts}', '**/music-player.ts'],
      outFile: resolve(__dirname, 'src/web/views/uno.css')
    }
  },
  presets: [presetWind3(), presetIcons({ mode: 'bg' })],
  extractors: [extractorArbitraryVariants()]
})
