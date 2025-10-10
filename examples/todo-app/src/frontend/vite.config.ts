import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import { compression } from 'vite-plugin-compression2';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [
    solidPlugin(),
    compression({ algorithm: 'gzip' }),
    compression({ algorithm: 'brotliCompress' }),
    checker({
      typescript: {
        tsconfigPath: './tsconfig.app.json',
      },
    }),
  ],
  build: {
    target: 'esnext',
  },
  envDir: '../../../..',
  envPrefix: ['VITE_', 'DFX_', 'CANISTER_ID_'],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4943',
        changeOrigin: true,
      },
    },
  },
});
