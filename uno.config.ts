import { resolve } from 'node:path'
import carbonIcons from '@iconify-json/carbon/icons.json'
import { extractorArbitraryVariants } from '@unocss/extractor-arbitrary-variants'
import { defineConfig, presetIcons, presetWind3 } from 'unocss'

export default defineConfig({
  cli: {
    entry: {
      patterns: ['**/*.{html,ts}', '**/music-player.ts'],
      outFile: resolve(__dirname, 'src/web/views/uno.css')
    }
  },
  content: { filesystem: ['src/**/*.{html,ts}'] },
  presets: [
    presetWind3(),
    presetIcons({
      mode: 'bg',
      collections: {
        carbon: () => carbonIcons
      }
    })
  ],
  extractors: [extractorArbitraryVariants()]
})
