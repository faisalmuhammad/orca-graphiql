# Compatibility and validation

Requires Orca desktop **1.4.248 or newer**. Runtime checks were performed on Orca **1.4.248**, macOS, on 2026-11-04 and 2026-11-05. Windows/Linux remain untested.

Runtime evidence comes from local development loading. Installation from the public release tag has not yet been exercised.

## Integration

GraphiQL 6.0.0 runs in an isolated central editor with React 19.3.1, GraphQL 16.15.0, toolkit 1.0.0, and Collections. HTTP requests use a trusted worker through public Orca APIs. Monaco workers, the icon font, scripts, and styles are bundled locally; text uses system fonts.

Fonts are embedded as CSS data URLs. Release 0.1.1 removes the standalone Codicon TTF rejected by the public indexer in 0.1.0; `npm --prefix build run release:check` checks for non-image binary files and symlinks before packaging.

Release 0.1.2 minifies the worker/sidebar, uses system text fonts, compresses the complete Codicon font to inline WOFF2, removes identical CSS rules, preserves upstream lazy JavaScript imports, and recompresses PNGs without changing pixels. See [bundle size measurements](BUNDLE_SIZE.md) for the audit and remaining opportunities.

The 0.1.2 optimizations have automated/static validation and headless Chrome checks of the built editor using a mocked public host plus the compiled worker and deterministic local fixture. The optimized 0.1.3 central editor has also executed Countries GetCountry in actual Orca, displayed the Germany result, and loaded 23 schema types. The redesigned Explorer has rendered with both its empty state and four sample sessions, including the Countries connection and operation timing, without frame errors. Its session actions have browser-fixture and worker-handler coverage. Broader central-editor runtime evidence below comes from earlier development builds.

Release 0.1.4 selects Monaco features, adds smaller local vendor chunks, and shares infrastructure between the editor, JSON, and GraphQL module workers. The official GraphiQL application and transport are unchanged. Its built-editor Chrome check passes schema autocomplete, unknown-field diagnostics, malformed-variable diagnostics from the native JSON worker, upstream formatters, Variables/Headers, both themes, and local fonts/icons, with no browser errors or external requests. TypeScript, 50 Orca native/source tests, 46 compiled-worker tests (four native tests skipped), and manifest/static checks pass. These checks use a mocked frame host or Orca's native test host; the newly shared module workers still need execution in an actual Orca editor tab. Existing screenshots remain unchanged.

Release 0.1.5 organizes source, tooling, tests, and original captures under `build/`. Compiled runtime assets remain at the root and are byte-identical to 0.1.4. Notices now inventory 84 bundled packages, credit 10 direct development tools with their primary licenses, and retain screenshot font licenses. Generated assets are marked for GitHub as generated; source remains readable. This layout change does not alter the execution profile, permissions, UI, or runtime validation limitations.

The transport uses GraphiQL 6's supported `Transport` interface. Operations are normalized to JSON before IPC because Orca rejects undefined properties. The native Variables/Headers strip has a minimal host CSS/event adaptation to keep tabs visible while collapsed and expand the selected tab.

## Verified behavior

- Release 0.1.3 adds request-size preflight checks in the editor and connection dialog, repeats the checks in the worker, and sizes the full JSON input in UTF-8. Oversized requests are refused before networking or credential persistence; oversized mutations are refused before confirmation.
- Release 0.1.3 native capture: Countries GetCountry returned HTTP 200 with Germany, Berlin, EUR, the German flag, and German; the IDE reported 23 schema types. Explorer showed four sample sessions and matching operation timing. The combined preview uses actual editor/panel captures; other sample endpoints remained disconnected.
- Redesigned Explorer: native Orca rendering, dark/light browser checks at widths 280–600 pixels, accurate overview counts, opening/renaming/confirmed removal/creation controls, refresh focus preservation, empty/error states, and untrusted session-name rendering. The sidebar HTML and minified CSS are built from their readable source files without additional runtime dependencies.
- Optimized browser build: query execution through the compiled worker/local fixture, schema autocomplete and unknown-field diagnostics, lazy GraphQL/JSONC formatting, Variables/Headers selection and expansion, both themes, system fonts in all four editors, and WOFF2 icon loading. No endpoint execution occurred before Connect; all browser asset requests were local and no browser errors occurred. This used headless Chrome with a mocked Orca host.
- Actual editor: the Countries `GetCountry` query returned Germany, Berlin, EUR, the German flag, and German. Introspection returned 23 types. Schema documentation, schema-aware autocomplete, light/dark themes, Variables/Headers expansion, Collections, native Save, and reopened operations were exercised.
- Actual worker: Countries query/introspection, secure storage, bearer/API-key fixture authentication, redirect refusal, disabled-introspection errors, and production mutation confirmation.
- Explorer handlers: session discovery, create-and-open, and reopening existing files.
- Automated checks: document conflicts/flush/read-only handling, copied-template identity isolation, transport bounds/cancellation/redaction, persistence isolation, file creation/discovery, and Explorer management. Use `orca plugin test build --json` to include native document tests; ordinary Vitest skips them.
- The minified worker is also checked with `npm --prefix build run test:bundle`, which reuses the deterministic worker fixtures against the compiled module.
- Build, TypeScript including unused-code checks, Orca manifest/static checks, packaged-folder inspection, and ZIP integrity/size checks pass. Packaging records file counts, sizes, and SHA-256 checksums in `dist/artifact.json`.

## Authoring guide review

Reviewed the current [authoring guide](https://github.com/stablyai/orca/blob/main/docs/reference/plugin-authoring.md) and [listing policy](https://github.com/stablyai/orca/blob/main/docs/reference/plugin-listing-policy.md) on 2026-11-05.

- Isolated desktop frames support locally served scripts, fonts, workers, data URLs, and relative lazy imports. The existing bundled architecture follows this model.
- Worker requests accept 64 KiB of JSON input, answer up to 1 MiB, and time out after at most 120 seconds. The plugin uses a 60 KiB input budget with clear errors and keeps its 768 KiB response cap and bounded timeouts.
- Packaging checks now match the documented 50 MiB folder/2,000-file limits, 10 MiB panel/editor entry limit, and 1 MiB limit for files Orca transpiles.
- Bundled/minified output is permitted when its source is in the repository. A release tag and the orca-plugin topic are the documented directory submission flow; a ZIP attachment is not required for that flow.
- The publisher field is deprecated in current Orca. It still matches the repository owner and is retained to preserve existing local development identity and approvals; Git/catalog installs derive the publisher from the source.

## Limitations

- The dependency audit reports unresolved DOMPurify advisories and development-tool advisories in the Vitest dependency chain. Monaco 0.57.0 includes a vendored DOMPurify 3.4.15 sanitizer, so an npm override alone would not update the bundled implementation. Applicability to Monaco's sanitizer configuration has not been established; these size optimizations do not resolve the advisories.
- Windows/Linux, exhaustive split-pane and keyboard behavior, the full external-edit matrix, and startup CPU/memory profiling need further validation. HTML panel screenshot input is unsupported, so Explorer coverage combines captures and handler tests.
- Orca accepts built-in sidebar activity icons only; the rail uses `code`. Image-capable contributions use the GraphQL logo.
- Discovery is bounded to 16 local workspaces, depth 8, 5,000 entries, two seconds, and 64 matches. It skips hidden/build/vendor directories, symlinks, malformed and oversized files. Sessions without identifiers need an open/save; duplicate copied identifiers are omitted from automatic discovery.
- Complete JSON worker-request inputs are limited to 60 KiB, including variables, extensions, headers, and connection settings, below Orca's 64 KiB input cap; responses/documents to 768 KiB. Local editor state is bounded to 512 KiB per session/environment/endpoint. Collections omit variables and headers. Endpoint URLs cannot contain credentials, query parameters, or fragments. Oversized responses are rejected whole. Redirects are refused. Subscriptions, multipart incremental responses, and chunked large responses are unsupported.
