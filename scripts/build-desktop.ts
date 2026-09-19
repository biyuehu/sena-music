import { aliasPlugin } from './alias-plugin'

const watching = process.argv.includes('--watch')

const result = await Bun.build({
  entrypoints: ['src/platform/desktop/main.ts'],
  outdir: 'dist/desktop',
  target: 'node',
  external: ['electron'],
  plugins: [aliasPlugin],
  minify: !watching
})

if (result.success) console.log(`Built desktop main process (${result.outputs.length} files)`)
else {
  for (const log of result.logs) console.error(log)
  if (!watching) process.exit(1)
}
