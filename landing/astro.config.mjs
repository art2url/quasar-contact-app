import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://quasar.contact',
  output: 'static',
  outDir: './dist',
  publicDir: './public',
  build: {
    assets: 'assets',
    inlineStylesheets: 'auto',
    format: 'directory', // This creates /about/ instead of /about.html
  },
  integrations: [
    sitemap({
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
    }),
  ],
  vite: {
    css: {
      devSourcemap: true,
    },
    build: {
      cssCodeSplit: false, // bundle CSS into one file
      rollupOptions: {
        output: {
          assetFileNames: 'assets/[name].[hash][extname]',
        },
      },
    },
    define: {
      'import.meta.env.GA_MEASUREMENT_ID': JSON.stringify(
        process.env.GA_MEASUREMENT_ID || ''
      ),
      'import.meta.env.ALPHA_BANNER_CLOSED': JSON.stringify(
        process.env.ALPHA_BANNER_CLOSED || 'false'
      ),
    },
  },
});
