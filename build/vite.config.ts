import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { recordInputs } from './scripts/provenance.mjs';
const monacoFeatures = fileURLToPath(new URL('./src/editor/monaco-features.ts', import.meta.url));
const optionalMonacoFeatures = /\/(?:anchorSelect|codelens|colorPicker|diffEditorBreadcrumbs|floatingMenu|gpu|inlayHints|inlineProgress|inPlaceReplace|linkedEditing|longLinesHelper|middleScroll|sectionHeaders|semanticTokens|stickyScroll|iPadShowKeyboard|inspectTokens)\/|\/(?:diffEditor[.]contribution|inlineCompletions[.]contribution|dropIntoEditorContribution)[.]js$/;
const diffEditorStub = fileURLToPath(new URL('./src/editor/stubs/diff-editor-widget.js', import.meta.url));
const multiDiffEditorStub = fileURLToPath(new URL('./src/editor/stubs/multi-diff-editor-widget.js', import.meta.url));
const framerMotionStub = fileURLToPath(new URL('./src/editor/stubs/framer-motion.jsx', import.meta.url));
function stubUnusedModules(): Plugin {
  return {
    name: 'graphiql-stub-unused-modules',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'framer-motion') return framerMotionStub;
      if (!importer?.replaceAll('\\', '/').includes('/monaco-editor/')) return;
      if (source.endsWith('/diffEditorWidget.js')) return diffEditorStub;
      if (source.endsWith('/multiDiffEditorWidget.js')) return multiDiffEditorStub;
    },
  };
}
function compactMonacoRegistrations(): Plugin {
  return {
    name: 'graphiql-monaco-feature-selection',
    transform(code, id) {
      // Monaco 0.57's JSON worker helper registers every UI feature as a side
      // effect. Use the same selected registrations as the public aggregate.
      // Its worker creation, model synchronization, and Trusted Types stay intact.
      if (!id.replaceAll('\\', '/').endsWith('/monaco-editor/esm/vs/internal/common/workers.js')) return;
      if (!code.includes('export { createWebWorker }') || !code.includes('createTrustedTypesPolicy') || !code.includes('suggestController.js')) {
        throw new Error('Monaco worker helper changed; review feature selection before upgrading.');
      }
      const removed: string[] = [];
      const compact = code.replace(/^import ['"]([^'"]+)['"];?\r?\n/gm, (statement, path: string) => {
        if (!optionalMonacoFeatures.test(path)) return statement;
        removed.push(path);
        return '';
      });
      for (const feature of ['codelensController.js', 'colorPickerContribution.js', 'diffEditor.contribution.js']) {
        if (!removed.some(path => path.endsWith('/' + feature))) throw new Error('Expected Monaco adaptation no longer applies: ' + feature);
      }
      return {
        // Retain the helper's core controllers (notably suggestions, paste,
        // and keyboard commands); public feature registrations alone omit them.
        code: compact,
        map: null,
      };
    },
  };
}
export default defineConfig({
  root: 'src/editor', base: './',
  plugins: [stubUnusedModules(), compactMonacoRegistrations(), {
    name: 'graphiql-bundle-provenance',
    generateBundle(_options, bundle) {
      const inputs = Object.values(bundle).flatMap(output => output.type === 'chunk'
        ? Object.entries(output.modules).filter(([, module]) => module.renderedLength > 0).map(([id]) => id) : []);
      // CSS is emitted separately and can have zero rendered JS bytes.
      inputs.push(...[...this.getModuleIds()].filter(id => /[.]css(?:[?]|$)/.test(id)));
      recordInputs('editor', inputs);
    },
  }],
  esbuild: { legalComments: 'none' },
  resolve: {
    alias: [{
      find: /^monaco-editor\/features\/register[.]all(?:[.]js)?$/,
      replacement: monacoFeatures,
    }],
  },
  build: {
    outDir: '../../../editor', emptyOutDir: true, target: 'es2022',
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
