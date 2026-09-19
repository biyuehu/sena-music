import { cpSync, existsSync } from 'node:fs'
import { aliasPlugin } from './alias-plugin'

if (!existsSync('dist/client')) throw new Error('dist/client is missing, run "bun run build" first')

const result = await Bun.build({
  entrypoints: ['src/server/app.ts'],
  outdir: 'dist/web',
  target: 'node',
  plugins: [aliasPlugin],
  minify: true
})

if (result.success) {
  cpSync('dist/client', 'dist/web/static', { recursive: true })
  cpSync('music.toml', 'dist/web/music.toml')
  console.log(`Built server (${result.outputs.length} files) with web assets`)
} else {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
