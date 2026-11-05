import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
const monacoFeatures = fileURLToPath(new URL('./src/editor/monaco-features.ts', import.meta.url));
const optionalMonacoFeatures = /\/(?:anchorSelect|codelens|colorPicker|diffEditorBreadcrumbs|floatingMenu|gpu|inlayHints|inlineProgress|inPlaceReplace|linkedEditing|longLinesHelper|middleScroll|sectionHeaders|semanticTokens|stickyScroll|iPadShowKeyboard|inspectTokens)\/|\/(?:diffEditor[.]contribution|inlineCompletions[.]contribution|dropIntoEditorContribution)[.]js$/;
function compactMonacoRegistrations(): Plugin {
  return {
    name: 'graphiql-monaco-feature-selection',
    transform(code, id) {
      // Monaco 0.57's JSON worker helper registers every UI feature as a side
      // effect. Use the same selected registrations as the public aggregate.
      // Its worker creation, model synchronization, and Trusted Types stay intact.
      if (!id.replaceAll('\\', '/').endsWith('/monaco-editor/esm/vs/internal/common/workers.js')) return;
      if (!code.includes('export { createWebWorker }') || !code.includes('createTrustedTypesPolicy')) {
        throw new Error('Monaco worker helper changed; review feature selection before upgrading.');
      }
      return {
        // Retain the helper's core controllers (notably suggestions, paste,
        // and keyboard commands); public feature registrations alone omit them.
        code: code.replace(/^import ['"]([^'"]+)['"];?\r?\n/gm, (statement, path: string) => optionalMonacoFeatures.test(path) ? '' : statement),
        map: null,
      };
    },
  };
}
export default defineConfig({
  root: 'src/editor', base: './',
  plugins: [compactMonacoRegistrations()],
  resolve: {
    alias: [{
      find: /^monaco-editor\/features\/register[.]all(?:[.]js)?$/,
      replacement: monacoFeatures,
    }],
  },
  build: {
    outDir: '../../editor', emptyOutDir: true, target: 'es2022',
    chunkSizeWarningLimit: 1000, cssCodeSplit: false, modulePreload: false,
    // Orca's public indexer disallows standalone binary fonts. Keep them local in CSS.
    assetsInlineLimit: filePath => /[.](ttf|otf|woff2?|eot)$/i.test(filePath) ? true : undefined,
    // Preserve upstream lazy imports for Monaco and formatters. All chunks are local.
    rollupOptions: { output: {
      onlyExplicitManualChunks: true,
      manualChunks(id) {
        const path = id.replaceAll('\\', '/');
        if (path.includes('/monaco-editor/esm/vs/')) {
          if (path.includes('/base/')) return 'monaco-base';
          if (path.includes('/platform/')) return 'monaco-platform';
          if (path.includes('/editor/common/')) return 'monaco-model';
          if (path.includes('/editor/standalone/')) return 'monaco-api';
          if (/\/widget\/(diffEditor|multiDiffEditor)\//.test(path)) return 'monaco-diff';
          if (path.includes('/editor/browser/')) return 'monaco-view';
          if (path.includes('/editor/contrib/')) return 'monaco-features';
          if (path.includes('/languages/')) return 'monaco-languages';
        }
        if (/\/node_modules\/(react|react-dom|scheduler|react-compiler-runtime)\//.test(path)) return 'react';
        if (/\/node_modules\/(graphql|graphql-language-service|@graphiql\/toolkit)\//.test(path)) return 'graphql';
        if (/\/node_modules\/(framer-motion|motion-dom|motion-utils)\//.test(path)) return 'motion';
        if (path.includes('/node_modules/zod/')) return 'validation';
      },
    } },
  },
  worker: { format: 'es' },
});
