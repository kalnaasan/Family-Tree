# Family-Tree

## Development

Node 22 (`.nvmrc`). `npm install`, then:

- `npm run dev` start the dev server
- `npm run lint`, `npm run typecheck`, `npm test` (Vitest), `npm run build`
- `npm run e2e` Playwright + axe (Chromium and WebKit; run `npx playwright install --with-deps chromium webkit` once)

The performance budget lives in `src/config/perf-budget.ts`. The build spec is `docs/spec/family-tree-spec.md`.
