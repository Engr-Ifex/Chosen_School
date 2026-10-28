import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The API is proxied so the browser only ever sees one origin, matching
    // the production arrangement described in docs/ARCHITECTURE.md §5.
    proxy: {
      '/api': {
        target: 'http://localhost:10000',
        changeOrigin: true,
      },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
