import { describe, expect, it } from 'bun:test'
import { createServer } from 'node:http'
import { startServer } from '../src/server/app'

describe('Server Port Auto-Healing', () => {
  it('should auto-retry and bind to next port when initial port is in use', async () => {
    const conflictPort = 19876

    // Pre-occupy conflictPort with a dummy server
    const dummyServer = createServer((_req, res) => {
      res.end('dummy')
    })

    await new Promise<void>((resolve, reject) => {
      dummyServer.once('error', reject)
      dummyServer.listen(conflictPort, () => resolve())
    })

    try {
      // Start server with conflictPort as initial port
      const { server, port } = await startServer(conflictPort, 5)

      // It should automatically avoid the conflict port and bind to conflictPort + 1
      expect(port).toBe(conflictPort + 1)

      // Clean up server
      await new Promise<void>((resolve) => server.close(() => resolve()))
    } finally {
      await new Promise<void>((resolve) => dummyServer.close(() => resolve()))
    }
  })
})
