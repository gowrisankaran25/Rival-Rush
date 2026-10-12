import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Rival-Rush/',
  plugins: [],
  server: { host: true },
  build: { target: 'es2022' },
  test: { environment: 'node', testTimeout: 15000 },
});
