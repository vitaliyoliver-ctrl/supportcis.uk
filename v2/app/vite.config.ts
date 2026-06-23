import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { mockApiPlugin } from './dev-mock-api';

const useMock = process.env.VITE_MOCK_API === '1';

export default defineConfig({
  plugins: [react(), ...(useMock ? [mockApiPlugin()] : [])],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: useMock
    ? {}
    : {
        proxy: {
          '/api': {
            target: 'http://localhost:8787',
            changeOrigin: true,
          },
        },
      },
});
