import { defineConfig,configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: { '/api/audio-lab': { target: 'http://127.0.0.1:8787', changeOrigin: true, proxyTimeout: 120000, timeout: 150000 } } },
  preview: {port:4173,proxy:{'/api/audio-lab':{target:'http://127.0.0.1:8787',changeOrigin:true,proxyTimeout:120000,timeout:150000}}},
  test: { exclude:[...configDefaults.exclude,'.qa/**','.local-only/**'], environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: true },
});
