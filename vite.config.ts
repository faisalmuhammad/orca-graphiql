import { defineConfig } from 'vite';
export default defineConfig({
  root: 'src/editor', base: './',
  build: {
    outDir: '../../editor', emptyOutDir: true, target: 'es2022',
    chunkSizeWarningLimit: 16000, cssCodeSplit: false, modulePreload: false,
    // Orca's public indexer disallows standalone binary fonts. Keep them local in CSS.
    assetsInlineLimit: filePath => /[.](ttf|otf|woff2?|eot)$/i.test(filePath) ? true : undefined,
    // Preserve upstream lazy imports for Monaco and formatters. All chunks are local.
  },
  worker: { format: 'es' },
});
