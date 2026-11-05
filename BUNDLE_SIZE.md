# Bundle size audit

Measurements compare the bundled 0.1.1 release with the optimized 0.1.2 build. All sizes are uncompressed unless specified.

| Component | 0.1.1 | 0.1.2 |
| --- | ---: | ---: |
| Editor assets | 8.38 MB | 7.59 MB |
| HTTP worker | 1.52 MB | 0.52 MB |
| Editor CSS (included above) | 1.07 MB | 0.38 MB |
| Preview images | 0.89 MB | 0.79 MB |
| Entire runtime folder | 11.70 MB | 9.81 MB |
| Release ZIP | 3.69 MB | 3.10 MB |
| Editor entry script (included above) | 5.98 MB | 1.27 MB |

MB means 1,000,000 bytes; values are rounded. Exact final sizes and checksums are recorded in `dist/artifact.json`. The full folder is approximately 16% smaller. The entry script is 1,265,947 bytes; the largest local chunk is 2,267,059 bytes. Total editor assets are 7,592,255 bytes. Compared with the earlier optimization build, system fonts, icon compression, duplicate CSS removal, and lazy chunks save a further 579,083 bytes of editor assets.

The audit covered the editor dependency graph, HTTP worker, sidebar, CSS/font assets, promotional images, source captures, and packaged files. Monaco is the dominant editor dependency. The Orca wrapper is small compared with the upstream IDE.

## Changes

- Minify the worker and sidebar with esbuild. Prefer GraphQL's ESM entry in the Node worker so unused exports can be removed.
- Replace Roboto and Fira Code with system UI and monospace fonts. Configure both GraphiQL's CSS variables and Monaco's measured font options through the supported editor hooks.
- Compress the complete Codicon icon font to locally embedded WOFF2: 153,228 bytes of TTF become 59,004 bytes of WOFF2. Verify a decompression round-trip: every font table, including glyph outlines, mappings, and metrics, matches, except WOFF2's checksum and lossless-transformation flag.
- Remove byte-identical font-face and style rules in the same CSS scope, retaining the last rule and updating the stylesheet's content hash and references.
- Preserve upstream dynamic imports instead of forcing all modules into one script. This saves about 90 KB of total JavaScript and defers formatters and Monaco chunks. Every chunk remains a local bundled asset.
- Recompress PNGs only when the output is smaller and decoded pixels match exactly. Original capture pixels and the approved cover design are preserved.
- Run the deterministic worker fixture tests against the compiled worker as well as the TypeScript implementation.

## Remaining opportunities

Monaco's full feature registration and GraphiQL's formatting/schema tooling account for most remaining JavaScript. Removing editor contributions, changing validation libraries, or replacing upstream formatters would require a separate compatibility investigation. React, GraphQL, and Monaco dependency versions are already deduplicated; no duplicate package versions were found to remove. Monaco's editor features and the upstream GraphQL/JSONC formatters are retained.

A Terser trial saved only about 38 KB on the already-minified main script; a direct Vite/Terser worker build also failed. The supported esbuild editor build is retained. Licenses and upstream third-party notices are preserved.

These checks do not establish startup CPU/memory improvements or guarantee that the catalog's size-review flag will clear. Public listing and platform validation remain described in [COMPATIBILITY.md](COMPATIBILITY.md).

Validation includes 45 native/source tests, 41 tests with the compiled worker (four native document tests are skipped by plain Vitest), TypeScript checks, Orca manifest/static checks, font-table round-trip checks, and pixel comparisons. Headless Chrome also exercises the actual built editor with a mocked public Orca host and the compiled worker against the local fixture. This browser check does not establish Orca GUI compatibility.

## Authoring-guide follow-up: 0.1.3

The table above records the 0.1.2 size work. Release 0.1.3 retains those optimizations and corrects worker-input preflight to a 60 KiB JSON budget below Orca's documented 64 KiB cap. Its editor assets total 7,592,647 bytes and its entry script is 1,266,339 bytes. The latest package measurements are recorded in dist/artifact.json.

The expanded regression suite passes 50 native/source tests and 46 compiled-worker tests (four native tests skipped by plain Vitest). Headless Chrome confirms that normal fixture execution still works and oversized Unicode variables show a clear error without crossing IPC. The package guard now matches the authoring guide's file-count, folder-size, entry-size, and transpilation limits.

The redesigned Explorer keeps the same worker contract and adds no runtime dependency. Its readable HTML/CSS lives under src/activity; the build copies its HTML and minifies its stylesheet alongside the existing script. Sidebar styling adds only a small amount to the overall package; current exact measurements remain in dist/artifact.json.
