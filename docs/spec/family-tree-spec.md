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

One breadth-first pass from the Focus person yields a descriptor per Person (kind, steps up/down, half?, in-law?, ex?, side); an English lookup turns it into a word. Recomputed on Tree or Focus change. Coverage: parent/child, great- grand lines without depth limit, siblings and **Half-siblings** (exactly one shared birth or adoptive parent), uncle/aunt, nephew/niece, cousins by degree and removal, partner (wife/husband when gender is known), "ex-" for ended Partnerships (current wins if both exist), limited in-laws through current Partnerships only, otherwise "Relative" with the path shown in the detail panel. Gendered words only when gender is known. One primary label by priority: blood over in-law, direct over collateral, shortest path, closer generation on ties. The Focus person shows no label. English and Arabic, one table per language (section 13.6; the descriptor also records the genders of the relatives a link passes through). This module is pure and DOM-free.

## 4. Layout and visual design ([Tree layout and rendering approach](https://github.com/kalnaasan/Family-Tree/issues/2), [Visual design language for the tree](https://github.com/kalnaasan/Family-Tree/issues/7))

- Hand-rolled SVG with our own pan/zoom. No React Flow, no canvas.
- Layout is a separate pure module: generation rows plus iterative barycenter relaxation, partners pulled together, per-row overlap resolution. It returns flat typed arrays and supports a **warm start** from the previous layout.
- Round fan crown: oldest generation at the top of the trunk, each later generation a ring further out, ~270° spread, branches bowing outward and thickening with descendant count. One straight tapered trunk and tapered roots below for v1. Known weakness: the crown is wide at scale (~1.9:1 at 500 people).
- Person node: round medallion; ring colour by gender (green / tan, neutral for other/unknown); photo replaces the default icon; deceased = muted ring plus a small mark. Partners: small heart on the join, dashed line and no heart when ended. Leaves are decorative and hidden when zoomed out and from assistive tech.
- Warm browns and greens, rounded sans for names, lighter dates underneath.
- Reference prototype (throwaway): branch `prototype/tree-layout`.

## 5. Adding and editing people ([Add-relative interaction flow](https://github.com/kalnaasan/Family-Tree/issues/5))

- Click a Person: a popover on the card offers Father, Mother, Brother, Sister, Husband, Wife, Partner, Son, Daughter, Child. Gendered choices preset the gender (editable). The grouped detail panel (Parents / Partners / Children / Siblings, each with one "Add" button) is the Person detail view and a second entry point to the same flow. *Amended by the UI redesign:* each section's Add button opens one dialog: step 1 chooses the relation (neutral first: parent, partner, child, sibling, or the gendered words) and whether to create a new person or link one already in the tree; step 2 is the add or link form below, with its questions and its "This will create / link" preview as the review. Edit details and the menu (Make Focus person, Delete) are in the panel's sticky header.
- An inline question appears **only when ambiguous**, always followed by a "This will create: …" preview. Rules:
  - Parent: a third birth parent is blocked with a message. With one existing birth parent, the new one defaults to that parent's current partner (change link: ended, none).
  - Sibling: two parents → choose both or only one (half-sibling); one parent → attach silently; none → create an unnamed shared parent (renameable).
  - Child: if partners exist, choose the other parent (default latest current partner), "Nobody / not recorded" always offered; otherwise single-parent child.
  - Wife / husband / partner: current or ended (default current).
- No separate actions for grandparents, uncles, cousins (reached via the intermediate Person).
- First run: an empty state with "Add the first person"; that Person becomes the Focus person. The Focus person can be changed from the detail panel, keyboard `F`, or the sheet.
- Prototype: branch `prototype/add-relative`.

### 5.1 Linking existing people and editing links ([Map: Edit relationships](https://github.com/kalnaasan/Family-Tree/issues/76), decisions in [Relationship editing: scope and UX](https://github.com/kalnaasan/Family-Tree/issues/75))

Until now a relative could only be added as a *new* Person, and a wrong link could not be fixed except by deleting the Person. This section adds linking an existing Person, removing a link, and editing a link. The vocabulary is `CONTEXT.md`'s: only **Parent links** and **Partnerships** are stored; sibling is derived.

- **Choose from the list.** Next to each "+ Father / Mother / Husband / Wife / Partner / Son / Daughter / Child / Brother / Sister" button in the panel there is a second choice, "Choose from the list". It opens a searchable picker in the panel instead of the new-Person fields. Everything after the choice is the add-relative flow unchanged: the same inline questions only when ambiguous, the same preview (worded "This will link: …"), one Undo step. Gendered relations do not filter the list: the picked Person keeps their own gender.
- **What linking does.** Father / mother / parent: a birth Parent link from the anchor to the picked Person; with one existing birth parent, the same question about their Partnership. Son / daughter / child: a birth Parent link from the picked Person to the anchor, with the same "other parent" question. Husband / wife / partner: a Partnership, current or ended. Brother / sister: the picked Person gets the anchor's birth parents as theirs (both, or one for a half-sibling, as in section 5); an anchor with no parents gets an unnamed shared parent, as in section 5. A new Parent link is always `birth`; its kind is changed afterwards in "Edit link".
- **The picker.** A search box (the matching rules of section 11, accents and Arabic included) over a list of Person lines showing name and birth and death years, so two people with the same name can be told apart. Keyboard: type, Arrow keys, Enter picks, Escape closes. On a phone it is inside the sheet and its rows are at least 44 px tall.
- **Invalid candidates are disabled, not hidden**, each with a one-line reason under the name: the Person themselves; already linked this way; would be their own ancestor; would give someone a third birth parent; already in a Partnership with the anchor. The reasons come from the same integrity check the domain uses (`IntegrityError.rule`), by running the link as a dry run, so the picker and the domain cannot disagree; the domain refusing is also the backstop for a stale picker. When no candidate is valid the list says "Nobody else can be linked this way".
- **Removing a link.** Each parent, child and partner chip in the panel has a menu with "Edit link" and "Remove link". A sibling chip has no menu, because that relation is derived: it is changed through the shared parents' links. Remove has no confirmation: the link goes, both Persons stay, and the toast says "Removed link between Maria and Karl · Undo". A Person left with no links to the Focus person is "Not connected", as today; removing a link never deletes a Person.
- **Edit link.** One dialog per link. A Parent link: kind (birth / adoptive / step); birth is disabled with the third-birth-parent reason when the child already has two other birth parents. A Partnership: status (current / ended) and optional start and end dates in the partial-date format of section 2, the end date only for an ended Partnership. One Undo step per save; Cancel changes nothing.
- **Keyboard and screen readers.** The chip menu is a button with `aria-haspopup="menu"`; the picker is a labelled combobox and listbox like the search box; disabled candidates are `aria-disabled` and their reason is part of the option's accessible description; the dialog traps focus and returns it to the chip that opened it. After linking or removing, focus returns to the Person's heading.
- **Undo.** Every action here is one history step named after it ("Link Maria as mother", "Remove link", "Edit link"), restoring the exact prior document.
- **Out of scope:** merging duplicate Persons; bulk or drag-and-drop link editing on the tree.
- Every string is in English and Arabic (section 13); the picker, chip menu and dialog are covered by the Chromium and Arabic e2e projects.

## 6. Photos ([Photo handling](https://github.com/kalnaasan/Family-Tree/issues/8))

JPEG/PNG/WebP up to 25 MB (HEIC rejected with "convert to JPEG first"); circular crop step (drag and zoom); stored as 512 px square WebP q~0.82 (JPEG fallback), EXIF stripped, orientation applied; Blob in its own IndexedDB store keyed by `photoId`; replacing/removing/deleting removes the Blob; orphans deleted on load; shown through object URLs, thumbnails ~192 px when zoomed out. Export is the Tree document plus a `photos` map `photoId → base64 data URL` ("Include photos", default on); import validates every photo (type, size cap, decodable) and rejects the file naming the Person; missing photo → default icon. Storage use shown in settings; a failed photo write shows a message and never blocks saving the Person.

## 7. Accessibility ([Accessibility and keyboard navigation of the tree](https://github.com/kalnaasan/Family-Tree/issues/9))

- WCAG 2.2 AA; colour never the only signal; contrast ≥ 4.5:1 for text, ≥ 3:1 for rings; visible focus rings; text scales with browser font size; reduced motion → no animated pan/zoom.
- The tree is one tab stop. Arrows follow family links (↑ parent, ↓ child, ←/→ sibling (swapped under right-to-left, section 13.2), `P` partner; repeats cycle in a stable order), `Enter` opens the Person, `F` sets Focus, `Home` returns to Focus. Zoom/pan: `+`, `-`, `0` (fit), Shift+arrows. The view keeps the focused Person visible.
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
- Person delete is in the panel's menu and asks first (a dialog that says what is removed and that relatives stay; Cancel has the keyboard); the toast "Deleted Maria · Undo" (~8 s) naming removed links follows. *Amended by the UI redesign: it was no-confirm before.* Import confirms with the number of Persons replaced and offers "Export current tree first".
- `navigator.storage.persist()` on first edit; if denied (or Safari) a banner with "Export a backup". Export reminder after 20+ edits or 30+ days (dismissible 30 days). Settings shows "Last backup: date". No File System Access auto-save in v1.
- One writing tab (Web Locks, BroadcastChannel fallback); the second tab is read-only with "Take over editing"; no live sync.
- Autosave ~500 ms after the last change with a Saved / Saving… / Could not save indicator; `beforeunload` guard only while a write is pending or failed; a failed write keeps the in-memory Tree, offers "Export a backup now", and retries on the next change.

## 11. Search (new in this assembly)

A search box matching first and last name, case- and accent-insensitive (and, for Arabic, letter-variant-insensitive, section 13.4). Picking a result selects the Person and pans there keeping the zoom; reachable by keyboard and by touch; the List view gets the same filter. Results are computed from the store (no index needed to 5,000 people).

## 12. Resolutions of conflicts between Mobile/touch and Large-tree performance

Decided with the user (all recommendations):

1. **Opening view and zoom range.** The minimum zoom is the fit-all zoom of the current Tree, floored at about 3%; the maximum stays 250%. Trees up to ~150 people open fit-all. Larger trees open on the Focus person at a readable zoom; "show whole tree" is always available. This replaces "fit the whole tree on first load" and the fixed 20% minimum in Mobile and touch.
2. **Touch targets.** The 48 px person target is guaranteed whenever zoom is at or above the "initial only" bucket. In the "dot" bucket a tap selects the nearest Person only within a small distance, otherwise it zooms in toward the tap; acting on a Person needs zooming in. This replaces "never below ~24 px radius even zoomed out".
3. **Minimap.** None in v1. Large-tree navigation relies on the Focus-person button, relative chips and Search (section 11). Revisit after the 1,000-person real-phone test.

## 12a. The chart (UI redesign, amends sections 4, 7, 8 and 12)

Settings > General chooses how the Tree is drawn; the **chart** is the default and the fan crown of section 4 stays as the "artistic tree". A device setting (`family-tree.treeShape`), not part of the Tree or a backup.

- **Layout.** The same generation rows and relaxation as the crown (`layoutTree`, `shape: 'rows'`), without the bend: each generation is a straight row one `ROW_STEP` below the last, partners adjacent, cards `CARD_PITCH` apart. Connected parts of the Tree are laid out separately and set side by side. Half-siblings, several partnerships, step and adoptive links, single parents and unknown parents all come from the links, never from the layout.
- **Drawing.** A Person is a card (avatar or initial, name, years, a word when related to the open Person: Selected, Ancestor, Descendant, Partner; the Focus person has a blue outline). Deceased: dashed outline and a cross. Partner bar between partners (dashed grey when ended); children hang from a bus under their parents (dashed for adoptive, dotted elbow for step). A band behind each generation says "Generation N · k people". Zoom drops the card to name only, an initial, then a dot (section 9). Palette and contrast: `CHART` in `palette.ts`.
- **Collapsing.** Each family (the children who share the same parents) has a button on its connector: "−" collapses it, "+N" says how many people are hidden. A collapsed family hides its children and everyone below them, plus partners who married in; the rest of the chart closes up (the hidden people are taken out before the layout). Expand all and Collapse all are at the top; `C` toggles the branches under the keyboard's Person. Opening a Person, a search result, or an arrow key into a collapsed branch opens the way to them and leaves other branches as they are. Collapsed state is not saved. Logic: `src/domain/collapse.ts`.
- **Opening view** (amends section 12, point 1): up to ~150 people the chart opens whole if its cards would then be drawn at least 45% (`CHART_MIN_OPEN_ZOOM`), otherwise on the Focus person at a readable zoom; Show whole tree is always available. The artistic tree keeps section 12 as written.
- **Accessibility.** One tab stop as in section 7; the branch buttons are `role="button"` with `aria-expanded`, a 44 px target, and reached by pointer or `C` (they are not tab stops). Every string is English and Arabic.

## 13. Languages and right-to-left ([Add Arabic support](https://github.com/kalnaasan/Family-Tree/issues/45))

English and Arabic ship. Arabic is Modern Standard Arabic; the owner, a native speaker, reviews every Arabic string and the kinship table before release. The design is a general layer, so another language is a table swap. Out of scope: the Hijri calendar, typing Arabic-Indic digits into date fields, regional dialects for kinship words, languages other than these two, and an Arabic README or `docs/`. The decisions and reasoning are in the closed tickets of the map; this section is the result. Where it differs from an earlier section, this section wins.

### 13.1 The translation layer ([Translation layer: strings, plurals and the language setting](https://github.com/kalnaasan/Family-Tree/issues/48))

- A small hand-rolled `t('key', {params})` over one typed message object per language; no i18n library. TypeScript fails the build if Arabic lacks a key English has. Both languages are in the main bundle (works offline, no flash of the wrong language).
- A plural message holds one text per form (zero, one, two, few, many, other), chosen with `Intl.PluralRules`, with `{count}` filled in. English supplies `one` and `other`; Arabic supplies all six, enforced by the type check. At runtime a missing text falls back to English, never the raw key.
- Pure code (`addRelative`, `navigation`, the undo history) returns structured results (a reason plus parameters), never English sentences; the interface turns them into words when it draws them. `showToast` and the load, error and save banners take a message (key plus parameters) and the component translates when it renders, so a visible toast and old undo entries follow a language switch. Developer errors (`throw new Error(...)`) and log text stay English.
- The **Language** (see `CONTEXT.md`) is stored in `localStorage` as `family-tree.language` (`auto`, `en` or `ar`), outside the Tree and backups. `auto` follows the browser's language list and falls back to English. Settings has a Language choice. Switching is live, with no reload: `lang` and `dir` on `<html>` change and the interface, including the Tree canvas, redraws.
- `AVAILABLE_LANGUAGES` is one constant. Until the release gate (13.8) passes it holds only English, so `auto` cannot switch an Arabic browser to unreviewed text.

### 13.2 Right-to-left layout ([Right-to-left layout: what flips and what stays](https://github.com/kalnaasan/Family-Tree/issues/49))

- Everything outside the canvas mirrors: header, search row and List view button, the side panel (it sits on the inline-end side, so on the left), the zoom and locate controls, the list view's indent guide. Written as logical CSS everywhere (`ms-`/`me-`, `start-`/`end-`, `text-start`, `border-s`); `rtl:` variants only where no logical equivalent exists. Symmetric elements (the bottom sheet's drag handle, the centred Toast) do not change.
- The Tree canvas is not mirrored: left and right in the Tree carry no meaning (siblings follow the order added, not age), so layout, caches, zoom and the existing tests are unchanged.
- Only the Undo and Redo icons mirror, and their order follows reading sequence. Settings, list, zoom +/-, fit and locate do not.
- Keyboard (amends section 7): under RTL the Left and Right arrows swap, so the arrow pointing the way Arabic reads (Left) means next in the sibling ring. `navigation.ts` takes `next`/`previous`, stays pure and language-free, and `TreeCanvas` maps the physical key using the current `dir`. Up (parent), Down (child) and `P` (partner) are unchanged. Shift+arrow panning and the Crop dialog's arrows stay physical, because the canvas and the photo are not mirrored.

### 13.3 Names drawn in the Tree ([Arabic names drawn in the tree: font, bidi and label width](https://github.com/kalnaasan/Family-Tree/issues/50))

- Font: system fonts with an explicit stack (system UI font, `Tahoma`, `Noto Naskh Arabic`, `sans-serif`); nothing bundled. A bundled font is revisited only if the real-phone check of Arabic rendering fails.
- Each name picks its own direction from its first strong letter, not from the page: the drawn label gets `direction` computed from the name; the Person panel, list and form fields use `dir="auto"`.
- A name is shortened at whole letters (graphemes, via `Intl.Segmenter`), with the same 18-letter cap and no snapping to word boundaries, in both scripts; still pure and DOM-free. The full name stays in the panel and the accessible name.
- The medallion initial is the first grapheme of the first name, skipping a leading "ال" when more letters follow. Latin names are unchanged.
- No new performance budget; see 13.7.

### 13.4 Search and name fields ([Arabic names in search, sorting and the name fields](https://github.com/kalnaasan/Family-Tree/issues/51))

- Search folds these, on both the query and the stored name (Arabic diacritics are already stripped as combining marks): alef variants `أ إ آ ٱ` → `ا`; `ى` → `ي`; `ة` → `ه`; `ؤ` → `و` and `ئ` → `ي` (`ء` stays); tatweel `ـ` removed; Persian `ک` → `ك` and `ی` → `ي`.
- No transliteration: a Latin query does not find an Arabic name or the reverse.
- For ranking, a leading "ال" on a name word is ignored, so `الحسن` counts as starting with `حسن` (not when the word is just "ال" or the rest is a single letter). The stored name is unchanged.
- Nothing in the app sorts by name, so none is added; if that changes it uses `Intl.Collator` with the current Language.
- The model is unchanged: required first name, optional last name, shown "first last". The Arabic field labels (الاسم الأول / اسم العائلة are proposals) are part of the owner's review.
- Fixtures: `generateTree(size, seed, { names: 'arabic' })` names people deterministically from about 40 Arabic given names and 20 family names without changing the Tree's shape; a small fixed set of tricky names (plain, long, mixed-script, diacritics, "ال") serves the search and label tests.

### 13.5 Dates and digits ([Dates and digits in Arabic](https://github.com/kalnaasan/Family-Tree/issues/52))

- Always Western digits (0-9) and the Gregorian calendar, set explicitly (`-u-ca-gregory-nu-latn`), whatever the browser's region. Digit style is not a setting. Date entry stays as it is.
- The dates line ("1930–2001") keeps its shape; a death-only date is "ت. 2001" in Arabic (flagged for review) and "d. 2001" in English. The dates line takes its direction from the Language, not from the name, so under RTL a range reads with 1930 on the right. The screen reader's "born 1962, died 2001" is a translated message.
- `formatWhen` and the 5,000-person notice follow the Language setting, not the browser's language, through one helper that everything calls; the hard-coded `'en'` goes away.
- The Born and Died fields get `dir="ltr"`, aligned to the start edge; the placeholder stays `YYYY-MM-DD`; the help text is translated with the format inside it. Backup file names are unchanged (`family-tree-YYYY-MM-DD.json`).

### 13.6 Relationship labels ([Arabic relationship labels: table and grammar](https://github.com/kalnaasan/Family-Tree/issues/47), research: [Arabic kinship terms in Modern Standard Arabic](https://github.com/kalnaasan/Family-Tree/issues/46))

Amends section 3. The final Arabic table is [arabic-relationship-labels.md](arabic-relationship-labels.md), one row per descriptor with a confidence mark.

- The descriptor is widened with the genders of the relatives a link passes through (uncle or aunt, sibling, the shared parent of a half-sibling, the intermediate child, the partner an in-law is related through, the uncle or aunt of an `uncle-partner`). English ignores the new fields. Where a needed gender is unknown, Arabic falls back to a generic form.
- `deriveRelationships` returns descriptors only and no label strings. A pure, DOM-free `labelFor(descriptor, gender, language)` is called when a label is drawn, with one table module per language (labels are grammar, not interface text, so they live apart from the dictionary but follow the same Language). Only Persons on screen get labels, and a language switch redraws them without re-deriving the Tree.
- Unknown gender: slash forms where both are short single words (أخ/أخت, جد/جدة, عم/عمة); `ولد` for children and children-of (ولد العم, ولد الأخ); `شريك الحياة` for partner; `أحد الوالدين` for parent; `قريب/قريبة` only where nothing fits.
- "great-" lines use one degree form past the first natural word (`جد من الدرجة الثالثة`, generations counted as in Arabic inheritance law); real words stay wherever they exist (جد, حفيد, عم, ابن الأخ). Second and further cousins use the degree form (`ابن عم من الدرجة الثانية`); "removed" cousins, which Arabic has no concept for, show `قريب/قريبة`.
- Ex-partners are "former" (`زوج سابق`, `زوجة سابقة`, `شريك سابق`), not `طليق`. Half-siblings are `أخ/أخت لأب` or `لأم`, and `غير شقيق` when the shared parent's gender is unknown. An uncle's or aunt's partner uses the literal forms (`زوجة العم`, `زوجة الخال`, `زوج العمة`, `زوج الخالة`). In-laws: parents-in-law `حم`/`حماة`; child-in-law and sibling-in-law are descriptive (`زوج الابنة`, `زوجة الابن`, `زوج الابن`, `شقيق الزوج`, `زوج الأخت`…), which also serves a same-sex partner of a child; the ambiguous single words حمو, صهر, نسيب, عديل and سلفة are not used. Step relatives (dormant) and the fallbacks `قريب`/`قريبة` and `غير مرتبط`/`غير مرتبطة` follow the table.
- Review gate: no row marked (K) or UNSURE ships until the owner has signed it off; the sign-off is recorded in the release checklist.

### 13.7 Test and acceptance strategy ([Test and acceptance strategy for Arabic](https://github.com/kalnaasan/Family-Tree/issues/53))

- A Playwright project `chromium-ar` and a WebKit twin re-run a chosen list of the existing specs with the language forced to Arabic (`family-tree.language` written before load): smoke, tree, keyboard, add-relative, search, backup, undo, touch, photos. English only: persistence, single-writer, large-tree, perf. Specs find controls through a helper that looks the name up in the same dictionary the app uses, so one spec file serves both languages. A small `language.spec` asserts a few literal Arabic strings, `lang="ar"` and `dir="rtl"`, and that switching is live. axe runs in RTL through the existing specs.
- Performance: an Arabic-names variant (13.4's fixture) in the `perf` project at 1,000 and 5,000 people against the same budget as English; no separate budget.
- Unit tests assert: identical message keys in both languages; all six plural forms present and 0, 1, 2, 5, 11 and 100 each picking the right one; every folding pair matches and Latin never matches Arabic, plus the "ال" ranking, letter-based truncation and initials; Western digits and Gregorian for every language even under an `ar-EG` browser; `labelFor` run exhaustively over every kind, gender and linking-relative combination with every Arabic result non-empty and free of Latin letters; the widened descriptor in the derivation tests.
- By hand, in `docs/arabic-release-checklist.md`: the owner's review of every string and of the kinship table; the real-phone check that Arabic fonts render (Android and iPhone, with the 1,000-person Arabic Tree); a screenshot pass of the RTL screens at phone and desktop widths.

### 13.8 Release gate

Arabic is offered only when: CI is green including the Arabic projects; the owner has signed off the strings and cleared every (K) and UNSURE row of the kinship table; the real-phone check is done and its results recorded; and the RTL screenshot pass is done. Build tickets merge to `main` behind `AVAILABLE_LANGUAGES`; adding Arabic to it is the release.

## 14. Cross-cutting acceptance criteria

Every build ticket carries the relevant criteria from sections 7 (axe, keyboard), 8 (touch emulation), 9 (budget), and 10 (the exact bullet it implements, e.g. "undo of an add-relative restores the exact prior document; the second tab cannot write"). Tickets that change text, direction, labels, names or dates also carry the criteria of section 13.
