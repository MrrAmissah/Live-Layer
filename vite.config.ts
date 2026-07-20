/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    host: '127.0.0.1',
    strictPort: true
  },
  preview: {
    port: 4173,
    host: '127.0.0.1',
    strictPort: true
  },
  test: {
    // Pure store/reducer + persistence tests run in node; a jsdom localStorage
    // stub is provided per-suite where needed. No component rendering yet.
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
