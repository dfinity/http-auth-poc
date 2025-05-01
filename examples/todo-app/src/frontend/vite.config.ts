import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { compression } from 'vite-plugin-compression2';

export default defineConfig({
  plugins: [
    solidPlugin(),
    compression({ algorithm: 'gzip' }),
    compression({ algorithm: 'brotliCompress' }),
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
        target: 'http://localhost:8000',
        changeOrigin: true,
        headers: {
          referer: 'http://bkyz2-fmaaa-aaaaa-qaaaq-cai.localhost:8000',
        },
      },
    },
  },
});
