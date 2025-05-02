import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src', 'main.ts'),
      name: 'insomnia-plugin-ic-http-auth',
      fileName: 'main',
      formats: ['cjs'],
    },
    sourcemap: true,
  },
});
