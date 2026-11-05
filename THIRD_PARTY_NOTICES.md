# Third-party credits and provenance

Explorer layout inspiration: [Rich Presence for Discord](https://www.onorca.dev/plugins/jondmarien/orca-discord-presence) by [jondmarien](https://github.com/jondmarien). The Explorer implementation uses the plugin's original code and GraphQL assets.

GraphiQL for Orca is an unofficial integration. The plugin's MIT license does not replace upstream licenses. [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) preserves installed dependency license texts and Monaco's upstream third-party notices. Versions are recorded in `package-lock.json`.

| Component | Provenance | License / notice |
| --- | --- | --- |
| GraphiQL 6, toolkit, React integration, Collections | [graphql/graphiql](https://github.com/graphql/graphiql), official npm packages | MIT, [LICENSE-GRAPHIQL](LICENSE-GRAPHIQL) |
| GraphQL.js | [graphql/graphql-js](https://github.com/graphql/graphql-js) | MIT, [LICENSE-GRAPHQL](LICENSE-GRAPHQL) |
| React, React DOM, compiler runtime | [facebook/react](https://github.com/facebook/react) | MIT, complete notices in TXT |
| Monaco and language tooling | [microsoft/monaco-editor](https://github.com/microsoft/monaco-editor) | MIT and upstream ThirdPartyNotices, [LICENSE-MONACO](LICENSE-MONACO) |
| GraphQL logo | Official GraphiQL package assets, converted to PNG | Asset distributed with MIT GraphiQL; no endorsement implied |
| Fira Code | Used in original screenshots; runtime uses system fonts; [tonsky/FiraCode](https://github.com/tonsky/FiraCode) | SIL OFL 1.1, [LICENSE-FIRA-CODE](LICENSE-FIRA-CODE) |
| Roboto | Used in original screenshots; runtime uses system fonts; Google/Christian Robertson | Apache 2.0, [LICENSE-ROBOTO](LICENSE-ROBOTO), [terms](LICENSE-APACHE-2.0) |
| Zod and transitive runtime libraries | Official lockfile-resolved npm packages | Original notices in TXT |
| TypeScript, Vite, Vitest, esbuild, PostCSS, Sharp, wawoff2, development typings | Official npm build/test/image/font tools; excluded as runtime dependencies from ZIP | Original direct-tool notices in TXT |
| Countries example | [Trevor Blades](https://github.com/trevorblades/countries), countries.trevorblades.com | External service; server source not bundled |
| Browser validation | [Playwright](https://github.com/microsoft/playwright) with local Google Chrome; temporary test tooling, not bundled | Playwright Apache 2.0; browser not redistributed |

`scripts/notices.mjs` records installed runtime dependencies, peer/optional packages, direct development tools, and original screenshot font notices. It can conservatively include installed optional packages not emitted into the bundle. The generated TXT starts with a package index linking every credited package to its `NOTICE-…` documents. Only byte-identical documents share a reference; each distinct original copyright, license, and notice text is included verbatim. This avoids repeated legal text without removing attribution or license terms.

Two npm packages omit license text. `licenses/react-remove-scroll-bar.txt` supplies its upstream MIT notice; `licenses/react-compiler-runtime.txt` supplies the React root MIT notice inherited by that package. Both enter the generated collection.

Orca is the host application. This repository includes neither its runtime nor upstream API declarations and supplies no Orca license file. The minimal interfaces in `src/shared/orca-api.ts` are original plugin code.
