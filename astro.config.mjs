import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://openweightarchive.com',
  output: 'static',
  adapter: cloudflare({ imageService: 'passthrough', remoteBindings: false }),
  session: false,
  server: { host: '127.0.0.1', port: 4321 },
  devToolbar: { enabled: false },
});
