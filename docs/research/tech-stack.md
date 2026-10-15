# Research: Tech stack choices (issue #6)

Question: which build tool, TypeScript setup, state management, test tooling and photo-storage approach for a single-user, browser-local React + Tailwind family-tree app (JSON export/import, optional local photos, organic tree drawing)?

Sources are official docs (Vite, Tailwind, React, Vitest, Playwright, Testing Library, Zustand, MDN). Where a fetched page did not state something, it is marked **not confirmed in source**. Versions/requirements were read on 2026-10-15; re-check at scaffold time.

## Recommendation summary

| Area | Recommendation |
|---|---|
| Build tool | Vite (`react-ts` template), static SPA, no framework |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` |
| TypeScript | Strict TS; Vite only transpiles, so add `tsc --noEmit` to build and CI; `isolatedModules: true` |
| State | Zustand store holding normalized Persons / Parent links / Partnerships; derived data (labels, layout) computed by selectors, never stored |
| Persistence | Tree as one JSON document in IndexedDB (via `idb`); `localStorage` not used for the tree |
| Photos | Resize client-side, store as `Blob` in a separate IndexedDB object store keyed by Person id; render via object URLs; export as base64 inside the JSON export |
| Tests | Vitest (unit, pure logic, jsdom) + React Testing Library (components) + Playwright (a few end-to-end flows incl. export/import) |

## Build tool: Vite

- React's docs recommend starting with a framework (Next.js, React Router, Expo) but explicitly allow building from scratch when constraints are not served by a framework, naming Vite, Parcel and RSbuild as build tools. This app has no server, routing or data fetching, so a framework buys nothing. Source: <https://react.dev/learn/start-a-new-react-project>
- Vite ships a `react-ts` template (`npm create vite@latest my-app -- --template react-ts`), requires Node.js 20.19+ or 22.12+, and bundles production builds with Rolldown. Source: <https://vite.dev/guide/>
- Tailwind v4 documents a first-party Vite path: `npm install tailwindcss @tailwindcss/vite`, add `tailwindcss()` to `plugins` in `vite.config.ts`, and `@import "tailwindcss";` in the CSS entry. Source: <https://tailwindcss.com/docs/installation/using-vite>
- Output is static files, deployable to any static host, matching the "no backend" scope.

## TypeScript setup

- Vite transpiles `.ts` but does not type-check; it assumes the IDE and build process do. Docs say to run `tsc --noEmit` alongside the production build, and `tsc --noEmit --watch` (or vite-plugin-checker) in development. Source: <https://vite.dev/guide/features.html#typescript>
- `isolatedModules` should be `true` (the transformer does not use type information, so `const enum` and implicit type-only imports are unsupported); use `import type` / `export type` for type-only imports. Same source.
- `skipLibCheck: true` is set by the starter templates; Vite ignores `target` in tsconfig. Same source.
- Recommended: `strict: true` (project choice; not a claim from Vite docs), build script `tsc --noEmit && vite build`.
- Model Person / Parent link / Partnership as TS types matching `CONTEXT.md`. Relationship label is a derived function result, not a stored field.

## State management

Options from primary sources:

1. **`useReducer` + Context** (React built-in). Docs describe pairing a reducer with two contexts (state and dispatch) so deep components can read and dispatch without prop drilling, and note you can have many such pairs. Zero dependencies. Source: <https://react.dev/learn/scaling-up-with-reducer-and-context>. Trade-off: Context consumers re-render when the context value changes (general React behaviour; not quoted from the page above), which matters for a large drawn tree where each node is a component.
2. **Zustand** (recommended). Its `persist` middleware supports custom async storage through `createJSONStorage` (docs example uses `idb-keyval` for IndexedDB), `partialize` to choose saved fields, and `version` + `migrate` for schema changes. Async storage means hydration is not complete at first render; use `persist.hasHydrated()` / `onFinishHydration`. Source: <https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data>
- Selector-based subscription in Zustand (components re-render only for the slice they select) is a library design property; **not confirmed in the page fetched** - verify at <https://zustand.docs.pmnd.rs/> before relying on it for the perf argument. Large-tree performance is ticket #11.
- Recommendation: Zustand, store shape = normalized maps `persons`, `parentLinks`, `partnerships`, plus `focusPersonId`. `version`/`migrate` give a path for schema evolution (ticket #3). Fall back to reducer+Context if the team wants zero dependencies; the store logic (pure reducer functions) is the same either way, so keep it framework-free and unit-testable.
- Undo/redo (ticket #12) is out of scope here; pure reducer-style updates keep it possible.

## Persistence

- `localStorage` is small and fixed: MDN reports 5 MiB per origin (the same page also says 10 MiB, so the page is inconsistent), throws `QuotaExceededError` when exceeded. IndexedDB and Cache use per-browser quotas based on disk size (Chromium up to 60% of disk, Firefox best-effort min(10% of disk, 10 GiB), Safari about 60% for browser apps). Source: <https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria>
- Data is **best-effort by default** and can be evicted under storage pressure (LRU, whole-origin, all-or-nothing). Request persistence with `navigator.storage.persist()` (Firefox prompts; Chromium/Safari decide from engagement); check `navigator.storage.estimate()`. Safari deletes script-created data after 7 days without user interaction when cross-site tracking prevention is on. Same source.
- Implication for a local-only app with no backup: call `navigator.storage.persist()` on first save and make **JSON export prominent** (reinforces ticket #12, data-loss protection).
- IndexedDB is async, versioned (`onupgradeneeded`), transactional, and stores structured-cloneable values; handle `onversionchange` by closing the DB (multi-tab). Source: <https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB>
- Use the `idb` wrapper (promise API, typed schema, ~1.19 kB brotli, ISC) rather than raw IndexedDB. Source: <https://github.com/jakearchibald/idb>. Maintenance status **not confirmed in source**; `idb-keyval` (used in Zustand's docs) is the simpler alternative if only one key/value document is stored.

## Photo storage

- `Blob` and `File` are on MDN's structured-clone supported-types list, so they can be put into IndexedDB values. Source: <https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm> (list entries only; the IndexedDB guide itself does not discuss Blobs).
- Recommended design:
  - Keep photos **out of** the tree JSON document. Separate IndexedDB object store `photos`, key = Person id (or photo id referenced by Person), value = `Blob`. Keeps the tree save small and fast.
  - Downscale on import: `createImageBitmap(blob, { resizeWidth, resizeHeight, resizeQuality: "high" })` applies EXIF orientation by default (`imageOrientation: from-image`), then draw to canvas and `canvas.toBlob(cb, "image/webp", 0.8)`. Only PNG is guaranteed by `toBlob`; WebP/JPEG are "supported by many browsers but not guaranteed", so check `blob.type` and fall back to `image/jpeg`. Sources: <https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap>, <https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob>
  - Display via `URL.createObjectURL(blob)` and revoke with `URL.revokeObjectURL` when unneeded (MDN's `toBlob` page notes revocation; the Blob page lists but does not explain it). Source: <https://developer.mozilla.org/en-US/docs/Web/API/Blob>
  - Export: embed photos as base64 data URLs inside the export JSON so a single file is a complete backup (design choice; size impact is the main trade-off - the exact size/format limits are ticket #8).
- Rejected: storing photos as base64 in `localStorage` (5 MiB cap, sync API).
- Not researched: File System Access API / OPFS as a photo store (only mentioned by MDN as part of the quota system); not needed for this scope.

## Test tooling

- **Vitest**: requires Vite >= 6.4.0 and Node >= 22.12.0; reads `vite.config.*` so plugins/settings are shared. Default environment is `node`; `jsdom` and `happy-dom` are built in (happy-dom faster but lacks some APIs); set globally or per file with `@vitest-environment`. Sources: <https://vitest.dev/guide/>, <https://vitest.dev/guide/environment>
  - Use for the core logic that matters most: relationship label derivation (ticket #4), tree layout math, schema migration, import validation. These are pure functions and need no DOM.
- **React Testing Library**: "The more your tests resemble the way your software is used, the more confidence they can give you." Install `@testing-library/react @testing-library/dom`. Use with Vitest + jsdom for the add-relative flow. Source: <https://testing-library.com/docs/react-testing-library/intro/>
- **Playwright Test**: Chromium, WebKit, Firefox; latest Node 22.x/24.x/26.x; `npm init playwright@latest`. Use for a handful of end-to-end flows (add people, reload and confirm persistence, export then import), and WebKit coverage for Safari storage behaviour. Source: <https://playwright.dev/docs/intro>
- Tree drawing (SVG/canvas) is best checked with Playwright screenshots later; the rendering approach is ticket #2.

## Node baseline

Vite needs 20.19+/22.12+, Vitest 22.12+, Playwright 22.x+. Pin **Node 22 LTS** (`.nvmrc` / `engines`) to satisfy all three.

## Open items / caveats

- Zustand selector re-render behaviour and `idb` maintenance status were not confirmed in the pages fetched.
- MDN's localStorage limit is stated inconsistently (5 vs 10 MiB); irrelevant to the design since the tree uses IndexedDB.
- Library versions deliberately not pinned here; pick current stable at scaffold time.
- Drawing library (SVG vs canvas, d3-hierarchy etc.) is out of this ticket; see #2.
