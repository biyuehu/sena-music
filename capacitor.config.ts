import type { CapacitorConfig } from '@capacitor/cli'

export default {
  appId: 'com.himenosena.music',
  appName: 'Sena Music',
  webDir: 'dist/client',
  server: { cleartext: true }
} satisfies CapacitorConfig
