# Third-party credits and provenance

GraphiQL for Orca is an unofficial integration. The plugin's MIT license does not replace upstream licenses. [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) preserves installed dependency license texts and Monaco's upstream third-party notices. Versions are recorded in `package-lock.json`.

| Component | Provenance | License / notice |
| --- | --- | --- |
| GraphiQL 6, toolkit, React integration, Collections | [graphql/graphiql](https://github.com/graphql/graphiql), official npm packages | MIT, [LICENSE-GRAPHIQL](LICENSE-GRAPHIQL) |
| GraphQL.js | [graphql/graphql-js](https://github.com/graphql/graphql-js) | MIT, [LICENSE-GRAPHQL](LICENSE-GRAPHQL) |
| React, React DOM, compiler runtime | [facebook/react](https://github.com/facebook/react) | MIT, complete notices in TXT |
| Monaco and language tooling | [microsoft/monaco-editor](https://github.com/microsoft/monaco-editor) | MIT and upstream ThirdPartyNotices, [LICENSE-MONACO](LICENSE-MONACO) |
| GraphQL logo | Official GraphiQL package assets, converted to PNG | Asset distributed with MIT GraphiQL; no endorsement implied |
| Fira Code | Fonts bundled by GraphiQL; [tonsky/FiraCode](https://github.com/tonsky/FiraCode) | SIL OFL 1.1, [LICENSE-FIRA-CODE](LICENSE-FIRA-CODE) |
| Roboto | Fonts bundled by GraphiQL; Google/Christian Robertson | Apache 2.0, [LICENSE-ROBOTO](LICENSE-ROBOTO), [terms](LICENSE-APACHE-2.0) |
| Zod and transitive runtime libraries | Official lockfile-resolved npm packages | Original notices in TXT |
| TypeScript, Vite, Vitest, esbuild, Sharp, development typings | Official npm build/test/image tools; excluded as runtime dependencies from ZIP | Original direct-tool notices in TXT |
| Countries example | [Trevor Blades](https://github.com/trevorblades/countries), countries.trevorblades.com | External service; server source not bundled |

`scripts/notices.mjs` records installed runtime dependencies, peer/optional packages, direct development tools, and embedded fonts. It can conservatively include installed optional packages not emitted into the bundle.

Two npm packages omit license text. `licenses/react-remove-scroll-bar.txt` supplies its upstream MIT notice; `licenses/react-compiler-runtime.txt` supplies the React root MIT notice inherited by that package. Both enter the generated collection.

Orca is the host application. This repository includes neither its runtime nor upstream API declarations and supplies no Orca license file. The minimal interfaces in `src/shared/orca-api.ts` are original plugin code.
