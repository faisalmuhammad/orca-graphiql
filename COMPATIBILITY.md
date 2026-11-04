# Compatibility and validation

Requires Orca desktop **1.4.248 or newer**. Runtime checks were performed on Orca **1.4.248**, macOS, on 2026-11-04. Windows/Linux remain untested.

## Integration

GraphiQL 6.0.0 runs in an isolated central editor with React 19.3.1, GraphQL 16.15.0, toolkit 1.0.0, and Collections. HTTP requests use a trusted worker through public Orca APIs. Monaco workers, fonts, scripts, and styles are bundled locally.

The transport uses GraphiQL 6's supported `Transport` interface. Operations are normalized to JSON before IPC because Orca rejects undefined properties. The native Variables/Headers strip has a minimal host CSS/event adaptation to keep tabs visible while collapsed and expand the selected tab.

## Verified behavior

- Actual editor: the Countries `GetCountry` query returned Germany, Berlin, EUR, the German flag, and German. Introspection returned 23 types. Schema documentation, schema-aware autocomplete, light/dark themes, Variables/Headers expansion, Collections, native Save, and reopened operations were exercised.
- Actual worker: Countries query/introspection, secure storage, bearer/API-key fixture authentication, redirect refusal, disabled-introspection errors, and production mutation confirmation.
- Explorer handlers: session discovery, create-and-open, and reopening existing files.
- Automated checks: document conflicts/flush/read-only handling, copied-template identity isolation, transport bounds/cancellation/redaction, persistence isolation, file creation/discovery, and Explorer management. Use `orca plugin test . --json` to include native document tests; ordinary Vitest skips them.
- Build, TypeScript including unused-code checks, Orca manifest/static checks, packaged-folder inspection, and ZIP integrity/size checks pass. Packaging records file counts, sizes, and SHA-256 checksums in `dist/artifact.json`.

## Limitations

- Windows/Linux, exhaustive split-pane and keyboard behavior, the full external-edit matrix, and startup CPU/memory profiling need further validation. HTML panel screenshot input is unsupported, so Explorer coverage combines captures and handler tests.
- Orca accepts built-in sidebar activity icons only; the rail uses `code`. Image-capable contributions use the GraphQL logo.
- Discovery is bounded to 16 local workspaces, depth 8, 5,000 entries, two seconds, and 64 matches. It skips hidden/build/vendor directories, symlinks, malformed and oversized files. Sessions without identifiers need an open/save; duplicate copied identifiers are omitted from automatic discovery.
- Requests are limited to 256 KiB; responses/documents to 768 KiB. Oversized responses are rejected whole. Redirects are refused. Subscriptions, multipart incremental responses, and chunked large responses are unsupported.
