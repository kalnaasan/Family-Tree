# Family Tree: build spec

Assembled from the closed tickets of the map ([#1](https://github.com/kalnaasan/Family-Tree/issues/1)). Vocabulary is in `CONTEXT.md`. Each section names the ticket that holds the detail and reasoning; where this document and a ticket differ, this document wins (it contains the final resolution of the conflicts in section 12).

Single-user, browser-local web app. A user records **Persons**, adds relatives relative to a Person, and sees the **Tree** drawn with ancestors at the roots and descendants in the crown. Out of scope: accounts, backend, sync, sharing, GEDCOM, record research, DNA.

## 1. Stack ([Tech stack choices](https://github.com/kalnaasan/Family-Tree/issues/6))

- Vite `react-ts` static SPA, Node 22 LTS, TypeScript strict + `isolatedModules`; build is `tsc --noEmit && vite build`.
- Tailwind v4 via `@tailwindcss/vite`. No framework router.
- Zustand store of normalized persons / parentLinks / partnerships + `focusPersonId`. Labels and layout are derived, never stored. Update logic is pure functions.
- IndexedDB via `idb`: the Tree document in one store, photo Blobs in another, Snapshots in a third.
- zod schemas are the single definition of the data model and validate imports.
- Tests: Vitest (+ jsdom), React Testing Library, Playwright (Chromium and WebKit), axe.

## 2. Data model ([Data model and persistence schema](https://github.com/kalnaasan/Family-Tree/issues/3), [Photo handling](https://github.com/kalnaasan/Family-Tree/issues/8))

- IDs: UUID v4 (`crypto.randomUUID()`).
- **Person**: `id`, `firstName` (required), `lastName?`, `gender` (`female|male|other|unknown`, default `unknown`), `birthDate?`, `deathDate?` (partial ISO: `YYYY`, `YYYY-MM`, `YYYY-MM-DD`), `deceased` boolean, `photoId?` (added by Photo handling).
- **Parent link**: `{ childId, parentId, kind }`, `kind` = `birth|adoptive|step`. The v1 UI creates only `birth`. At most two `birth` parents per Person, no gender requirement.
- **Partnership**: `{ id, personIds: [a, b], status: 'current'|'ended', startDate?, endDate? }`. Unordered, many per Person, never implies children.
- **Document**: `{ format: 'family-tree', schemaVersion, exportedAt, focusPersonId, persons[], parentLinks[], partnerships[] }`. Schema version 1 has no `photoId`; **schema version 2 adds `Person.photoId`**. Since nothing ships before v1, the first release may start at the final shape, but the migration step 1→2 must still exist and be tested because the Photo handling decision named it. Migrations run on load, one per version step.
- **Integrity rules** (enforced by the store functions, not the UI): no parent cycles, no self-links or self-partnerships, no duplicate links or Partnerships, deleting a Person deletes their links, Partnerships and photo Blob, several disconnected parts allowed. Import runs the same checks and rejects an invalid file naming the failed rule.

## 3. Relationship labels ([Relationship label derivation](https://github.com/kalnaasan/Family-Tree/issues/4))

One breadth-first pass from the Focus person yields a descriptor per Person (kind, steps up/down, half?, in-law?, ex?, side); an English lookup turns it into a word. Recomputed on Tree or Focus change. Coverage: parent/child, great- grand lines without depth limit, siblings and **Half-siblings** (exactly one shared birth or adoptive parent), uncle/aunt, nephew/niece, cousins by degree and removal, partner (wife/husband when gender is known), "ex-" for ended Partnerships (current wins if both exist), limited in-laws through current Partnerships only, otherwise "Relative" with the path shown in the detail panel. Gendered words only when gender is known. One primary label by priority: blood over in-law, direct over collateral, shortest path, closer generation on ties. The Focus person shows no label. English only; a table swap adds languages later. This module is pure and DOM-free.

## 4. Layout and visual design ([Tree layout and rendering approach](https://github.com/kalnaasan/Family-Tree/issues/2), [Visual design language for the tree](https://github.com/kalnaasan/Family-Tree/issues/7))

- Hand-rolled SVG with our own pan/zoom. No React Flow, no canvas.
- Layout is a separate pure module: generation rows plus iterative barycenter relaxation, partners pulled together, per-row overlap resolution. It returns flat typed arrays and supports a **warm start** from the previous layout.
- Round fan crown: oldest generation at the top of the trunk, each later generation a ring further out, ~270° spread, branches bowing outward and thickening with descendant count. One straight tapered trunk and tapered roots below for v1. Known weakness: the crown is wide at scale (~1.9:1 at 500 people).
- Person node: round medallion; ring colour by gender (green / tan, neutral for other/unknown); photo replaces the default icon; deceased = muted ring plus a small mark. Partners: small heart on the join, dashed line and no heart when ended. Leaves are decorative and hidden when zoomed out and from assistive tech.
- Warm browns and greens, rounded sans for names, lighter dates underneath.
- Reference prototype (throwaway): branch `prototype/tree-layout`.

## 5. Adding and editing people ([Add-relative interaction flow](https://github.com/kalnaasan/Family-Tree/issues/5))

- Click a Person: a popover on the card offers Father, Mother, Brother, Sister, Husband, Wife, Partner, Son, Daughter, Child. Gendered choices preset the gender (editable). The grouped detail panel (Parents / Partners / Siblings / Children with "+ Add") is the Person detail view and a second entry point to the same flow.
- An inline question appears **only when ambiguous**, always followed by a "This will create: …" preview. Rules:
  - Parent: a third birth parent is blocked with a message. With one existing birth parent, the new one defaults to that parent's current partner (change link: ended, none).
  - Sibling: two parents → choose both or only one (half-sibling); one parent → attach silently; none → create an unnamed shared parent (renameable).
  - Child: if partners exist, choose the other parent (default latest current partner), "Nobody / not recorded" always offered; otherwise single-parent child.
  - Wife / husband / partner: current or ended (default current).
- No separate actions for grandparents, uncles, cousins (reached via the intermediate Person).
- First run: an empty state with "Add the first person"; that Person becomes the Focus person. The Focus person can be changed from the detail panel, keyboard `F`, or the sheet.
- Prototype: branch `prototype/add-relative`.

## 6. Photos ([Photo handling](https://github.com/kalnaasan/Family-Tree/issues/8))

JPEG/PNG/WebP up to 25 MB (HEIC rejected with "convert to JPEG first"); circular crop step (drag and zoom); stored as 512 px square WebP q~0.82 (JPEG fallback), EXIF stripped, orientation applied; Blob in its own IndexedDB store keyed by `photoId`; replacing/removing/deleting removes the Blob; orphans deleted on load; shown through object URLs, thumbnails ~192 px when zoomed out. Export is the Tree document plus a `photos` map `photoId → base64 data URL` ("Include photos", default on); import validates every photo (type, size cap, decodable) and rejects the file naming the Person; missing photo → default icon. Storage use shown in settings; a failed photo write shows a message and never blocks saving the Person.

## 7. Accessibility ([Accessibility and keyboard navigation of the tree](https://github.com/kalnaasan/Family-Tree/issues/9))

- WCAG 2.2 AA; colour never the only signal; contrast ≥ 4.5:1 for text, ≥ 3:1 for rings; visible focus rings; text scales with browser font size; reduced motion → no animated pan/zoom.
- The tree is one tab stop. Arrows follow family links (↑ parent, ↓ child, ←/→ sibling, `P` partner; repeats cycle in a stable order), `Enter` opens the Person, `F` sets Focus, `Home` returns to Focus. Zoom/pan: `+`, `-`, `0` (fit), Shift+arrows. The view keeps the focused Person visible.
- Each Person is a focusable element named like "Maria, mother, born 1962"; a live region announces moves ("Karl, father of Ben, 2 children"); decorative parts are hidden.
- "List view" toggle: nested collapsible list of the same Tree with the same add/edit actions.
- Verification (acceptance on every UI ticket): axe in Playwright; manual keyboard-only add-relative run; screen-reader spot-check (NVDA or VoiceOver) of tree and list view before each release.

## 8. Mobile and touch ([Mobile and touch interactions](https://github.com/kalnaasan/Family-Tree/issues/10), amended by section 12)

- One-finger drag pans, pinch zooms, double-tap toggles zoom; ~8 px tap slop. Visible + / − , "show whole tree", "back to Focus person" buttons (≥ 44 px) on the right edge as the single-pointer alternative. Only the canvas disables native touch gestures.
- Tap a Person: bottom sheet peeks (~150 px: name, Add relative, Details); swipe up or tap the handle for the detail panel (~62%); tap empty space or swipe down dismisses. The view auto-pans so the Person is never hidden; relatives stay bright, others dim. Sheet chips jump to a relative keeping the zoom. No long-press or hidden gestures. Below ~45% zoom only the initial shows in the medallion.
- ≥ 768 px wide: popover and side panel instead of the sheet.
- Reduced motion: view changes jump.
- Acceptance: Playwright touch emulation for tap, drag, pinch; manual check on one real phone.
- Reference prototype: branch `prototype/mobile-touch`.

## 9. Performance ([Large-tree performance](https://github.com/kalnaasan/Family-Tree/issues/11))

- Sizes: smooth ≤ 200 people, usable ≤ 1,000, hard limit 5,000 (reduced detail, Worker layout, one-time notice).
- Techniques, in order: pan/zoom by imperatively transforming one `<g>` (no React re-render per move); discrete LOD buckets (full → no leaves → initial only → dot), with the leaf threshold one of the bucket edges; viewport culling (also lazy-loads photos); memoised nodes with primitive props and per-person Zustand selectors; layout on the main thread to ~1,000 and in a Web Worker beyond, warm-started on edit. No canvas fallback; `will-change` only if profiling demands. DOM cap ~2,500 elements (estimate, unverified on mobile).
- Budget at 4× CPU throttle, 390 px viewport (200 / 1,000 / 5,000 people): pan/zoom p95 frame ≤ 16.7 / 20 / 33 ms; first paint ≤ 1 / 2 / 5 s; layout ≤ 50 / 200 / 1,500 ms; edit→redraw ≤ 100 / 300 / 1,000 ms. Budget numbers live in one config file.
- Testing: seeded fixture generator (15 / 150 / 500 / 1k / 5k people), Vitest layout bench, Playwright with CDP CPU throttling and rAF/longtask sampling (verify the CDP call when writing the test), one real-phone check.
- Source: `docs/research/large-tree-performance.md` on branch `research/large-tree-performance`.

## 10. Undo and data-loss protection ([Undo/redo and data-loss protection](https://github.com/kalnaasan/Family-Tree/issues/12))

- Undo step = one user action (a whole add-relative flow, a Person edit save, a delete with its links, a Focus change). Ctrl/Cmd+Z, Shift+Z and buttons. In-memory history, ~50 steps, cleared on reload, everything but import undoable; deleted photo Blobs stay in memory until their step leaves history.
- **Snapshots**: up to 5 automatic copies in their own IndexedDB store, taken on load, at most hourly during active editing, and always just before an import; settings "Restore a previous version" (date, number of people).
- Person delete has no confirm; toast "Deleted Maria · Undo" (~8 s) naming removed links. Import confirms with the number of Persons replaced and offers "Export current tree first".
- `navigator.storage.persist()` on first edit; if denied (or Safari) a banner with "Export a backup". Export reminder after 20+ edits or 30+ days (dismissible 30 days). Settings shows "Last backup: date". No File System Access auto-save in v1.
- One writing tab (Web Locks, BroadcastChannel fallback); the second tab is read-only with "Take over editing"; no live sync.
- Autosave ~500 ms after the last change with a Saved / Saving… / Could not save indicator; `beforeunload` guard only while a write is pending or failed; a failed write keeps the in-memory Tree, offers "Export a backup now", and retries on the next change.

## 11. Search (new in this assembly)

A search box matching first and last name, case- and accent-insensitive. Picking a result selects the Person and pans there keeping the zoom; reachable by keyboard and by touch; the List view gets the same filter. Results are computed from the store (no index needed to 5,000 people).

## 12. Resolutions of conflicts between Mobile/touch and Large-tree performance

Decided with the user (all recommendations):

1. **Opening view and zoom range.** The minimum zoom is the fit-all zoom of the current Tree, floored at about 3%; the maximum stays 250%. Trees up to ~150 people open fit-all. Larger trees open on the Focus person at a readable zoom; "show whole tree" is always available. This replaces "fit the whole tree on first load" and the fixed 20% minimum in Mobile and touch.
2. **Touch targets.** The 48 px person target is guaranteed whenever zoom is at or above the "initial only" bucket. In the "dot" bucket a tap selects the nearest Person only within a small distance, otherwise it zooms in toward the tap; acting on a Person needs zooming in. This replaces "never below ~24 px radius even zoomed out".
3. **Minimap.** None in v1. Large-tree navigation relies on the Focus-person button, relative chips and Search (section 11). Revisit after the 1,000-person real-phone test.

## 13. Cross-cutting acceptance criteria

Every build ticket carries the relevant criteria from sections 7 (axe, keyboard), 8 (touch emulation), 9 (budget), and 10 (the exact bullet it implements, e.g. "undo of an add-relative restores the exact prior document; the second tab cannot write").
