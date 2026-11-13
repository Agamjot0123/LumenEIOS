import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy third-party libraries from application code so the entry chunk stays small and cacheable.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(recharts|d3-[^/]+|victory-vendor|recharts-scale|decimal\.js-light|eventemitter3|fast-equals|lodash)\//.test(id)) return 'vendor-charts';
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|@remix-run|scheduler)\//.test(id)) return 'vendor-react';
          return 'vendor';
        },
      },
    },
  },
  server: {
    port: 3000,
    open: false,
    host: true,
  },
});

