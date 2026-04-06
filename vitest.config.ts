import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/__tests__/**',
        'src/server.ts',   // entry point — just calls listen
        'src/client.ts',   // runnable script
        'src/client-demo.ts', // runnable script
        'src/keygen.ts',   // runnable script
      ],
    },
  },
})
