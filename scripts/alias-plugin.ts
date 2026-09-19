import { join } from 'node:path'
import type { BunPlugin } from 'bun'

const ROOT = join(import.meta.dir, '..')

const ALIASES: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^@\/romi\/client$/, () => 'src/framework/core/client.ts'],
  [/^@\/romi\/web$/, () => 'src/framework/web/index.ts'],
  [/^@\/romi\/utils\/(.+)$/, (match) => `src/framework/utils/${match[1]}`],
  [/^@\/romi$/, () => 'src/framework/core/index.ts'],
  [/^(src\/.+)$/, (match) => match[1]]
]

export const aliasPlugin: BunPlugin = {
  name: 'alias',
  setup: (build) => {
    build.onResolve({ filter: /^(@\/romi|src\/)/ }, (args) => {
      const matched = ALIASES.map(([pattern, toTarget]) => {
        const match = args.path.match(pattern)
        return match ? toTarget(match) : undefined
      }).find((target) => target !== undefined)
      return matched ? { path: Bun.resolveSync(`./${matched}`, ROOT) } : undefined
    })
  }
}
