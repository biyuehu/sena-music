export function stringifyCatchError(e: unknown): string {
  return e instanceof Error ? `(${e.name}) ${e.message}` : String(e)
}
