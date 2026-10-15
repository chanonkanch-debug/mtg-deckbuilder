import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes the build work from any path, including a GitHub Pages project site.
export default defineConfig({
  base: './',
  plugins: [react()],
});
