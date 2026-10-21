import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import config from './astro.config.mjs';

// Opt-in Node/Vite development only. There is no production adapter in this config.
// Workers development and every production build use astro.config.mjs instead.
export default defineConfig({
  ...config,
  adapter: undefined,
  vite: {
    resolve: {
      alias: { 'cloudflare:workers': fileURLToPath(new URL('./lib/server/dev-env.ts', import.meta.url)) },
    },
  },
});
