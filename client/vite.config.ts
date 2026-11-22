import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * The response headers Vercel sends for every page (vercel.json), applied to
 * `vite preview` as well. That is what lets the Content-Security-Policy be
 * tested against the real production build on a laptop before it is deployed:
 * one source of truth, so the two cannot drift.
 */
function productionHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
    headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  };
  const all = config.headers?.find((entry) => entry.source === '/(.*)')?.headers ?? [];
  return Object.fromEntries(all.map(({ key, value }) => [key, value]));
}

const proxy = {
  '/api': {
    target: 'http://localhost:10000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The API is proxied so the browser only ever sees one origin, matching
    // the production arrangement described in docs/ARCHITECTURE.md §5.
    proxy,
  },
  preview: {
    proxy,
    headers: productionHeaders(),
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
