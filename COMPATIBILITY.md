# Compatibility and validation

Requires Orca desktop **1.4.248 or newer**. Runtime checks were performed on Orca **1.4.248**, macOS, on 2026-11-04. Windows/Linux remain untested.

Runtime evidence comes from local development loading. Installation from the public release tag has not yet been exercised.

## Integration

GraphiQL 6.0.0 runs in an isolated central editor with React 19.3.1, GraphQL 16.15.0, toolkit 1.0.0, and Collections. HTTP requests use a trusted worker through public Orca APIs. Monaco workers, the icon font, scripts, and styles are bundled locally; text uses system fonts.

Fonts are embedded as CSS data URLs. Release 0.1.1 removes the standalone Codicon TTF rejected by the public indexer in 0.1.0; `npm run release:check` checks for non-image binary files and symlinks before packaging.

Release 0.1.2 minifies the worker/sidebar, uses system text fonts, compresses the complete Codicon font to inline WOFF2, removes identical CSS rules, preserves upstream lazy JavaScript imports, and recompresses PNGs without changing pixels. See [bundle size measurements](BUNDLE_SIZE.md) for the audit and remaining opportunities.

The 0.1.2 optimizations have automated/static validation and headless Chrome checks of the built editor using a mocked public host plus the compiled worker and deterministic local fixture. This version has not yet been exercised in the Orca GUI. The Orca runtime evidence below comes from earlier development builds.

The transport uses GraphiQL 6's supported `Transport` interface. Operations are normalized to JSON before IPC because Orca rejects undefined properties. The native Variables/Headers strip has a minimal host CSS/event adaptation to keep tabs visible while collapsed and expand the selected tab.

## Verified behavior

- Optimized browser build: query execution through the compiled worker/local fixture, schema autocomplete and unknown-field diagnostics, lazy GraphQL/JSONC formatting, Variables/Headers selection and expansion, both themes, system fonts in all four editors, and WOFF2 icon loading. No endpoint execution occurred before Connect; all browser asset requests were local and no browser errors occurred. This used headless Chrome with a mocked Orca host.
- Actual editor: the Countries `GetCountry` query returned Germany, Berlin, EUR, the German flag, and German. Introspection returned 23 types. Schema documentation, schema-aware autocomplete, light/dark themes, Variables/Headers expansion, Collections, native Save, and reopened operations were exercised.
- Actual worker: Countries query/introspection, secure storage, bearer/API-key fixture authentication, redirect refusal, disabled-introspection errors, and production mutation confirmation.
- Explorer handlers: session discovery, create-and-open, and reopening existing files.
- Automated checks: document conflicts/flush/read-only handling, copied-template identity isolation, transport bounds/cancellation/redaction, persistence isolation, file creation/discovery, and Explorer management. Use `orca plugin test . --json` to include native document tests; ordinary Vitest skips them.
- The minified worker is also checked with `npm run test:bundle`, which reuses the deterministic worker fixtures against the compiled module.
- Build, TypeScript including unused-code checks, Orca manifest/static checks, packaged-folder inspection, and ZIP integrity/size checks pass. Packaging records file counts, sizes, and SHA-256 checksums in `dist/artifact.json`.

## Limitations

- The dependency audit reports unresolved DOMPurify advisories and development-tool advisories in the Vitest dependency chain. Monaco 0.57.0 includes a vendored DOMPurify 3.4.15 sanitizer, so an npm override alone would not update the bundled implementation. Applicability to Monaco's sanitizer configuration has not been established; these size optimizations do not resolve the advisories.
- Windows/Linux, exhaustive split-pane and keyboard behavior, the full external-edit matrix, and startup CPU/memory profiling need further validation. HTML panel screenshot input is unsupported, so Explorer coverage combines captures and handler tests.
- Orca accepts built-in sidebar activity icons only; the rail uses `code`. Image-capable contributions use the GraphQL logo.
- Discovery is bounded to 16 local workspaces, depth 8, 5,000 entries, two seconds, and 64 matches. It skips hidden/build/vendor directories, symlinks, malformed and oversized files. Sessions without identifiers need an open/save; duplicate copied identifiers are omitted from automatic discovery.
- GraphQL operation payloads are limited to 256 KiB; responses/documents to 768 KiB. Local editor state is bounded to 512 KiB per session/environment/endpoint. Collections omit variables and headers. Endpoint URLs cannot contain credentials, query parameters, or fragments. Oversized responses are rejected whole. Redirects are refused. Subscriptions, multipart incremental responses, and chunked large responses are unsupported.
