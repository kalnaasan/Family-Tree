# Family-Tree

## Development

Node 22 (`.nvmrc`). `pnpm install`, then:

- `pnpm dev` start the dev server
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (Vitest), `pnpm build`
- `pnpm e2e` Playwright + axe (Chromium and WebKit; run `pnpm exec playwright install --with-deps chromium webkit` once)

The performance budget lives in `src/config/perf-budget.ts`. The build spec is `docs/spec/family-tree-spec.md`.
