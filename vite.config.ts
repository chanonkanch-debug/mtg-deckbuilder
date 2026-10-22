import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes the build work from any path, including a GitHub Pages project site.
// In dev, /edhrec is passed through to EDHREC's JSON pages (src/lib/edhrec.ts).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: { '/edhrec': { target: 'https://json.edhrec.com', changeOrigin: true, rewrite: p => p.replace(/^\/edhrec/, '') } },
  },
});
