import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // zundo·zustand/shallow 는 lazy 로드되는 에디터 라우트에서만 import 되어
  // Vite 의존성 사전 스캔에 잡히지 않을 수 있다. 명시적으로 include 해 서버
  // 시작 시 한 번에 사전 번들 → 페이지 진입 시 재최적화(504) 방지.
  optimizeDeps: {
    include: ['zundo', 'zustand/shallow'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
