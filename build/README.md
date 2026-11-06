# Building GraphiQL for Orca

The repository root is the installable Orca plugin. `build/` contains its source, locked dependencies, tests, and build tooling. Keep `editor/`, `worker/`, and `activity/` at the plugin root: Orca loads their compiled JavaScript directly.

Requires Node.js 22+ and npm. From this directory:

```sh
npm ci
npm run build
npm run typecheck
npm test
npm run test:bundle
orca plugin test . --json
orca plugin validate .. --json
orca plugin check .. --json
```

`build.mjs` runs the complete recipe from a fixed working directory. GraphiQL's supported Vite integration builds the editor, esbuild builds shared local Monaco/GraphQL workers and the trusted HTTP worker/sidebar, and asset optimization removes text fonts and compresses the complete icon font. Finally, notices are generated from the packages actually present in emitted modules. Dependencies and assets remain local.

## Layout

- `src/`: TypeScript/React editor, trusted worker, sidebar, shared contracts, and document persistence. TypeScript provides build-time checks; all runtime output is JavaScript.
- `tests/`: deterministic HTTP fixtures and transport, authentication, persistence, and Explorer tests.
- `scripts/`: worker builds, dependency provenance, asset optimization, notices, package validation, and preview generation.
- `vite.config.ts`: local asset output, lazy imports, selected Monaco features, and vendor chunks.
- `licenses/`: original upstream fallback texts for packages whose npm archives omit a license file.
- `assets/captures/`: original Orca captures used to regenerate the approved previews.
- `.cache/`: generated dependency provenance for notice generation; excluded from Git and uploads.

## Compatibility adaptations

The official GraphiQL React application is retained. The wrapper uses `orca.document.session()` for conflict-aware document synchronization, `orca.plugin.request()` for bounded requests, and the trusted worker for networking and secrets. Opening a session never approves or executes a request.

Monaco's public feature registrations retain schema suggestions, snippets, diagnostics, hover, formatting, find, navigation, folding, and accessibility. Optional extras such as CodeLens, color pickers, inlay hints, and sticky scroll are omitted. A guarded transform removes the corresponding optional side-effect imports from Monaco's worker helper; its core controllers, worker factory, synchronization, and Trusted Types logic remain intact. An upstream helper change fails the build. The unused diff editor widget and multi-diff editor widget are stubbed via a `resolveId` plugin, eliminating the `monaco-diff` chunk entirely; neither is called by this plugin or upstream dependencies.

framer-motion is stubbed with a lightweight React module that renders `Reorder.Item`/`Reorder.Group` as plain `<li>`/`<ul>` elements without animation or drag. This is used exclusively by `@graphiql/react`'s tab component for drag-to-reorder, which is not a core feature.

Vite keeps upstream lazy imports and produces smaller local vendor chunks. The three module workers are built together with shared infrastructure; the build updates constructor URLs and removes obsolete standalone outputs. Small chunks alone do not reduce total bytes.

UI/editor text uses system fonts. The complete Codicon font is compressed to inline WOFF2 because the public indexer rejects standalone binary fonts. Compression is verified by comparing decompressed font tables. Marketing screenshots use lossy palette quantization; the runtime icon and original captures keep lossless pixel-verified compression.

## Notices and credits

Vite/Rollup and esbuild record packages contributing emitted code or styles. `npm run notices` requires those inventories, so run `npm run build` first. Complete original runtime license/notice documents remain verbatim (excluding upstream third-party aggregation files such as prettier's and Monaco's own downstream notices), with byte-identical documents shared through a package index. Direct development tools retain credits and their primary license texts, capped at 5 KB with a pointer to the npm registry; their executables and transitive dependencies are installed by npm rather than distributed with the plugin. Screenshot font notices remain included. See [credits and provenance](../THIRD_PARTY_NOTICES.md).

## Runtime checks and packaging

Orca's test runner supplies the native document host; ordinary Vitest skips those tests. `npm run test:bundle` also runs deterministic tests against the compiled worker at `../worker/main.mjs`. HTTP integration tests bind only localhost.

With the repository root loaded as an approved development plugin, `npm run runtime:test` executes the Countries query through the actual worker. `npm run runtime:fixture` checks authentication, redirect refusal, disabled introspection, and production confirmation with a deterministic local server. `orca plugin shot .. --editor <file>` can capture the real editor; input actions require Orca hidden/minimized.

`npm run package` produces a runtime-only ZIP, size measurements, and checksums under `../dist/`. It includes root runtime assets, templates, previews, documentation, and licenses, without build sources, original captures, dependencies, or caches. Git installs use tagged files directly and do not require this ZIP.

From the repository root, stage uploaded additions and removals with `git add .`, then run `npm --prefix build run release:check`. The checker enforces Orca's 2,000-file / 50 MiB folder limits, 10 MiB entry limit, and 1 MiB transpilation limit, plus a stricter project budget of 1 MiB per editor JavaScript chunk. It rejects non-image binaries, symlinks, and missing tracked files.

Exclude `node_modules/` at every depth, `.orca/`, `.cache/`, `dist/`, logs, and OS metadata from uploads. Add the plugin root—not `build/`—in Orca's Development folders settings.

## Preview generation

`npm run screenshots` regenerates rounded gradient frames from original captures; append `-- activity-panel.png` to regenerate only that preview. `npm run images` regenerates the approved cover. These commands are optional and separate from runtime testing; existing images do not need replacing for build-only changes.
