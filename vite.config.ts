import { defineConfig } from 'vite';

// BASE_PATH lets CI deployments (e.g. GitHub Pages) serve the game from a sub-path.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
});
