import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Use esbuild for minification — native, multi-threaded, 10–20× faster than Terser
    minify: 'esbuild',

    // Target modern browsers — eliminates legacy polyfill transpilation overhead
    target: 'esnext',

    // No sourcemaps in production — saves significant I/O time and disk space
    sourcemap: false,

    // Raise the warning threshold; our chunks are intentionally large (xlsx split out)
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        // Fine-grained manual chunk splitting for optimal HTTP/2 parallelism
        manualChunks(id) {
          // Framer Motion animation library
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-motion';
          }
          // Lucide icons — tree-shaken by Vite; kept in own chunk for caching
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          // Recharts charting library (+ d3 dependencies)
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/d3/')) {
            return 'vendor-charts';
          }
          // Heavy export libs — split into own async chunk; loaded only on user action
          if (id.includes('node_modules/xlsx')) {
            return 'vendor-xlsx';
          }
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/jspdf-autotable') || id.includes('node_modules/html2canvas')) {
            return 'vendor-pdf';
          }
          // DOMPurify
          if (id.includes('node_modules/dompurify') || id.includes('node_modules/purify')) {
            return 'vendor-purify';
          }
          // React core — let Vite manage this internally to avoid circular deps
          // (do NOT manually chunk react/react-dom when using Vite's React plugin)
        },
      },
    },
  },
});
