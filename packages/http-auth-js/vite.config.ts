import { tanstackViteConfig } from '@tanstack/config/vite';
import { defineConfig, mergeConfig } from 'vite';

const config = defineConfig({});

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: ['./src/index.ts', './src/auth/index.ts'],
    srcDir: './src',
    outDir: './dist',
    tsconfigPath: './tsconfig.lib.json',
  }),
);
