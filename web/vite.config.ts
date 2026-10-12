import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './src/pwa';

export default defineConfig({
  plugins: [react(), VitePWA(pwaOptions)],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:4280' } },
});
