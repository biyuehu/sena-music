import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { aliasPlugin } from './alias-plugin'

const watching = process.argv.includes('--watch')

// Clean up any stale package.json in dist/desktop so main.js is correctly loaded as ESM
const stalePkg = join(process.cwd(), 'dist/desktop/package.json')
if (existsSync(stalePkg)) {
  try {
    unlinkSync(stalePkg)
  } catch {}
}

const resultMain = await Bun.build({
  entrypoints: ['src/platform/desktop/main.ts'],
  outdir: 'dist/desktop',
  target: 'node',
  external: ['electron'],
  plugins: [aliasPlugin],
  minify: !watching
})

const resultPreload = await Bun.build({
  entrypoints: ['src/platform/desktop/preload.ts'],
  outdir: 'dist/desktop',
  target: 'node',
  format: 'cjs',
  naming: '[name].cjs',
  external: ['electron'],
  plugins: [aliasPlugin],
  minify: !watching
})

const success = resultMain.success && resultPreload.success
if (success) {
  console.log('Built desktop process: main.js and preload.cjs (cjs)')
} else {
  for (const log of [...resultMain.logs, ...resultPreload.logs]) console.error(log)
  if (!watching) process.exit(1)
}
