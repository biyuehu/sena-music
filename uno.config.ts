import { resolve } from 'node:path'
import carbonIcons from '@iconify-json/carbon/icons.json'
import { extractorArbitraryVariants } from '@unocss/extractor-arbitrary-variants'
import { defineConfig, presetIcons, presetWind3 } from 'unocss'

export default defineConfig({
  content: {
    pipeline: {
      include: [/\.(vue|svelte|[jt]sx?|mdx?|astro|elm|php|phtml|html)($|\?)/, 'src/**/*.{html,ts}']
    },
    filesystem: [resolve(import.meta.dirname, 'src/**/*.{html,ts}').replace(/\\/g, '/')]
  },
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
