import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig({
  // 相對路徑可支援 GitHub Pages Repository 子路徑部署。
  base: './',
  plugins: [react(), tailwindcss()],
});
