import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src', 'index.ts'),
      name: '@dfinity/http-auth',
      fileName: 'http-auth',
    },
    sourcemap: true,
  },
  test: {
    root: 'tests',
    globalSetup: './tests/global-setup.ts',
    testTimeout: 30_000,
  },
});
