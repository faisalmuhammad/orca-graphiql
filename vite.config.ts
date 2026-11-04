import { defineConfig } from 'vite';
export default defineConfig({ root: 'src/editor', base: './', build: { outDir: '../../editor', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 16000, cssCodeSplit: false, modulePreload: false, rollupOptions: { output: { inlineDynamicImports: true } } }, worker: { format: 'es' } });
