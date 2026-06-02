import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@comp-intel/shared': process.env.DOCKER
        ? '/monorepo/packages/shared/src'
        : path.resolve(__dirname, '../packages/shared/src'),
    },
    preserveSymlinks: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['@radix-ui/react-dropdown-menu', '@radix-ui/react-dialog'],
          'vendor-axios': ['axios'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3334,
    watch: {
      usePolling: !!process.env.DOCKER,
    },
    fs: {
      allow: ['..'],
    },
    proxy: {
      '/api': {
        target: process.env.NODE_ENV === 'development' && process.env.DOCKER
          ? 'http://backend:8888'
          : 'http://localhost:8888',
        changeOrigin: true,
      },
    },
  },
})
