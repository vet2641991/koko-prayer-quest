import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // On the host (Cloudflare Pages sets CF_PAGES=1), refuse to build a dashboard that cannot connect, or that would
  // ship a secret key to every browser.
  if (process.env.CF_PAGES) {
    if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY) {
      throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the Cloudflare Pages project (docs/DEPLOY.md).');
    }
    if (!env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
      throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY must be the publishable key (sb_publishable_…), never a secret key.');
    }
  }
  return {
    plugins: [react()],
    build: { outDir: 'dist', sourcemap: false, target: 'es2022', chunkSizeWarningLimit: 900 },
    server: { port: 5174 },
  };
});
