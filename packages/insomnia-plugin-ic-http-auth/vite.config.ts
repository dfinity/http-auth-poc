import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';

export default defineConfig({
  build: {
    lib: {
      entry: './src/main.ts',
      name: 'insomnia-plugin-ic-http-auth',
      fileName: 'main',
      formats: ['cjs'],
    },
    sourcemap: false,
  },
  plugins: [
    checker({
      typescript: {
        tsconfigPath: './tsconfig.lib.json',
      },
    }),
  ],
});
