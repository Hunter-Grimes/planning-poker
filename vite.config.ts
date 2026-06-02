import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Served from a sub-path on GitHub Pages (https://<user>.github.io/planning-poker/).
  // Change this if you deploy under a different path or at a domain root ('/').
  base: '/planning-poker/',
});
