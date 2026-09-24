import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    // Deliberately not Tokyo or UTC: date helpers must not depend on the
    // machine's time zone.
    env: { TZ: 'America/Los_Angeles' },
  },
})
