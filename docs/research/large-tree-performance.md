# Research: Large-tree performance (issue #11)

Question: what tree sizes must the app handle smoothly, and which rendering/layout techniques keep it responsive at that size?

Evidence grading: **[P]** primary source (MDN, React, web.dev, peer-reviewed poster), **[S]** secondary/anecdotal, **[I]** our inference or extrapolation from the prototype numbers (`prototype/tree-layout`: layout ~70 ms at 500 people before crown; crown 15 people ~957x825 px, 150 ~4584x2636, 500 ~9506x5024). Nothing here was measured on a real phone; the budget below exists to be verified by the Playwright tests in section 4.

## 1. Target sizes

| Tier | People | Meaning |
|---|---|---|
| Smooth | up to **200** | Typical user. Full budget met on a mid-range phone, no visible degradation tricks needed beyond LOD. |
| Usable | up to **1,000** | Enthusiast. Pan/zoom stays fluid (culling + LOD active), edit-to-redraw feels instant, first render may take a beat. |
| Hard limit (supported) | **5,000** | Loads, lays out (in a Worker), pans and zooms without freezing. Names and photos only appear at close zoom. Show a one-time notice. Not refused above this, just not guaranteed or tested. |

Justification:
- Ancestry cited ~1 billion names in 10 million trees in 2009, i.e. an average of ~100 people per tree [S] (https://www.geneamusings.com/2010/01/how-many-people-are-in-ancestrycom.html). Rootsweb WorldConnect averaged 1,376 persons per database, and a blogger's sample of 100 Ancestry surname databases averaged 1,981 with a range of 0 to 40,000+ [S] (https://www.geneamusings.com/2009/06/some-average-database-sizes.html). Distributions are heavily skewed, so the median is well below these means. All figures are 2009-2010 blog-reported numbers; I found no current first-party median.
- That matches the ticket brief: typical 20-200, enthusiasts 500-2,000, extreme 5,000+. 200 / 1,000 / 5,000 covers the typical tier fully, most enthusiasts, and the extreme tier at degraded detail. These are single-user, hand-entered trees (no GEDCOM mass import in v1), which keeps most users in the low tiers.

## 2. SVG rendering limits

- Horak, Kister, Dachselt (TU Dresden, IEEE VIS 2018 poster) measured FPS for SVG (D3), Canvas and WebGL (PixiJS) on tree visualisations: **performance losses began above ~400 nodes for all technologies, about 8,000 graphical elements** (1 node = 15 elements). **SVG and Canvas performed about equally**, contradicting the "canvas is faster" assumption; WebGL was faster (and nearly flat without text). They list level-of-detail (remove details/labels when zoomed out) as a first improvement strategy. [P] https://mt.inf.tu-dresden.de/cnt/uploads/Horak-2018-Graph-Performance-Poster.pdf (Device class is not stated in the poster text I could read; assume desktop.)
- Desktop micro-benchmark: 1,000 objects ~10 ms SVG vs ~1 ms canvas for a full draw (Chrome 73, 2018 MacBook Pro) [S] https://blog.logrocket.com/when-to-use-html5s-canvas-ce992b100ee8/ . Older and about full redraws, not a pan on a retained scene.
- I found **no published mobile-specific element-count threshold**. Developer reports only say full-screen animated SVG is slow on weak mobiles [S] https://gsap.com/community/forums/topic/16011-svg-performance-run-slow-on-mobile-should-i-switch-to-canvas/ .
- **[I] Working budget: keep mounted DOM at or below ~2,500 SVG elements on a mid-range phone** (assume desktop's ~8,000 divided by 3-4 for CPU, plus style/paint cost of paths with gradients and clip-paths). Our estimate per person: medallion ring + photo image/clip + name + dates + deceased mark + branch path ~ 6-8 elements, plus 3-5 decorative leaves. So ~8 per person without leaves, ~13 with. Full-render, no culling: ~300 people with leaves before hitting the budget, ~1,000 without leaves at far zoom as dots (1-2 elements each). This is why culling + LOD, not a canvas switch, is what holds 5,000.

## 3. Techniques, ranked for our design

1. **Single `<g>` transform, updated imperatively (highest value, lowest cost).** Pan/zoom writes `transform` on one `<g>` through a ref inside `requestAnimationFrame`; React does not re-render per pointer move. Zustand holds only coarse view state (zoom bucket, culling window), committed at gesture end or when thresholds cross. Per-node updates during gestures would be O(N) DOM writes per frame. Reduced-motion jump behaviour from #10 is unaffected.
2. **Level-of-detail by discrete zoom buckets, not continuous.** Buckets keep re-renders rare (render only when the bucket changes): (a) close: photo, name, dates, leaves; (b) mid: name + medallion, leaves hidden (the #7 threshold); (c) below ~45% (the #10 threshold): initial only in the medallion; (d) very far: plain dot + thin branch, no text, no images, branches simplified to straight/coarser curves. Horak et al. name LOD as their main fix [P].
3. **Viewport culling.** Compute visible persons/branches from the viewport rectangle in world coordinates plus a margin (about one viewport), recompute only when the viewport leaves the margin or the bucket changes. Layout positions are already in a flat array, so a linear scan of 5,000 rects per recompute is trivial; no quadtree needed [I]. Keep a branch if either endpoint is visible. Mount only visible nodes: this also bounds photo loading (item 7).
4. **React rendering strategy.** `React.memo` the Person node and Branch components with primitive props (id, x, y, bucket, selected, highlighted); `memo` is useless if any prop is a fresh object/function each render [P] https://react.dev/reference/react/memo . Per-person Zustand selectors (`useStore(s => s.persons[id])`) so an edit re-renders one node. Layout output is one derived structure from a selector or memo, never stored in the model. If React Compiler is adopted it replaces most manual `memo` [P] (same page); not required. Use stable keys (person id). Dimming of non-relatives (from #10) must be a prop derived once, not a new style object per node.
5. **Layout off the critical path.** Layout is already a pure separate step. Run it on the main thread up to ~1,000 people (~70 ms at 500, so ~140 ms at 1,000 if linear, **unverified** [I]); beyond that, or if the measured budget is exceeded, run in a Web Worker. Workers cannot touch the DOM and copy messages by structured clone unless buffers are transferred [P] https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers , so return positions as a `Float32Array` transferred zero-copy. Build the layout module with no DOM/React imports so it works in either place.
6. **Edit relayout.** v1: full relayout per edit, debounced, **warm-started** from the previous positions (seed the barycenter relaxation with old coordinates, new nodes placed beside their relative) so the tree does not jump and iterations converge faster [I]. True incremental/partial relayout is not needed up to 1,000; revisit if 5,000-person edits exceed the budget. Keep the previous layout visible while the Worker computes.
7. **Photos.** Store a small thumbnail (target ~192 px square, WebP/JPEG) for the medallion, separate from any larger detail-panel image; #6 already decided client-side downscale to Blobs. Only mount `<image>` for culled-in persons in LOD (a); revoke object URLs of culled-out persons or cache with an LRU cap (~150). `loading="lazy"` and `decoding="async"` are documented for HTML `<img>` [P] https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img but MDN does not document them for SVG `<image>`, so **don't rely on them**; culling is the lazy loader. Consider `createImageBitmap` pre-decode off-thread for the detail panel only. Exact sizes/limits remain with #8.
8. **`will-change` / CSS transform.** MDN: use `will-change` only as a last resort for an existing problem, not preemptively; it costs memory and applying it to big subtrees can hurt [P] https://developer.mozilla.org/en-US/docs/Web/CSS/will-change . Do not add it by default. Transform on the `<g>` attribute first. Only if profiling shows repaint per frame, toggle `will-change: transform` from script for the gesture duration. A fallback trick, unverified for our design: during a pinch, CSS-transform the whole `<svg>` element and re-render crisp at gesture end.
9. **Canvas fallback: not recommended.** Horak et al. found SVG about on par with Canvas [P], so switching buys little; it would also break accessibility (#9) and styling (#2). If 5,000-person tests fail even with culling and LOD, the next step is WebGL/PixiJS for the far-zoom bucket only, a separate decision. Trigger: p95 frame time > 33 ms at 4x CPU throttle with culling on at 5,000.

Skip/not needed: minimap (see section 5), virtualised photo grids, incremental layout, tiles/offscreen workers.

## 4. Performance budget and how to test it

Reference device: mid-range phone, simulated as Chromium with 4x CPU throttling at a 390x844 viewport. Budgets are proposals to be checked, not measurements.

| Metric | 200 people | 1,000 | 5,000 |
|---|---|---|---|
| Layout compute (unthrottled desktop) | <= 50 ms | <= 200 ms | <= 1.5 s (in Worker, UI stays responsive) |
| Time from data loaded to first tree paint (4x throttle) | <= 1 s | <= 2 s | <= 5 s with progress indicator |
| Pan/zoom frame time p95 (4x throttle) | <= 16.7 ms | <= 20 ms | <= 33 ms |
| Edit (add person) to updated tree visible | <= 100 ms | <= 300 ms | <= 1 s |
| Mounted SVG elements at any time | <= 2,500 | <= 2,500 | <= 2,500 |
| Long tasks > 50 ms during pan/zoom | 0 | <= 2 | <= 5 |

Interaction responsiveness anchor: INP at or below 200 ms is "good", above 500 ms is "poor" [P] https://web.dev/articles/inp .

Testing:
- **Fixtures:** a deterministic generator `generateTree(n, seed)` producing realistic shape (couples, 1-4 children, 2 root couples, some half-siblings, ~10% ended partnerships, ~20% with photos), committed under tests. Sizes 15, 150, 500, 1,000, 5,000 (the first three match the prototype so numbers can be compared to its crown measurements).
- **Unit/bench (Vitest):** time the pure layout function per size, assert against the layout budget with a generous margin (CI machines vary) and log results; also assert layout determinism for the same seed.
- **E2E (Playwright, Chromium only for perf):** load the fixture via IndexedDB seeding, create a CDP session (`page.context().newCDPSession(page)`, https://playwright.dev/docs/api/class-cdpsession ), call `Emulation.setCPUThrottlingRate` with `{rate: 4}`, then drive a scripted wheel/drag/pinch gesture and sample frame times via `requestAnimationFrame` deltas and a `PerformanceObserver` for `longtask` inside `page.evaluate`; also count `svg *` elements for the mounted-DOM budget. Assertions on p95, not mean. The CDP method name and parameter are from my knowledge of the DevTools protocol; the protocol doc page fetch did not return the method text, so verify when writing the test.
- **Real device:** the build ticket already requires one manual real-phone check (#10); add: 1,000-person fixture, 30 s of pan/zoom, note stutter. Run perf tests in a nightly/optional CI job, not on every PR (flaky timing).
- **Regression guard:** store budget numbers in one config file so tuning is a one-line change.

## 5. Impact on earlier decisions (flagged, nothing changed silently)

1. **#10 "view fits the whole tree on first load" with zoom range 20%-250%.** Conflict: on a 390 px wide phone, fitting the prototype crowns needs ~40% at 15 people, ~8.5% at 150 (390/4584) and ~4% at 500 (390/9506) [I, arithmetic from the measured crown widths]. A 20% floor means the whole tree fits only for roughly 30 people or fewer on a phone. Suggested: min zoom = fit-to-tree zoom (never below the floor of what is useful, e.g. 3%), and for trees above ~150 people open on the Focus person at a readable zoom instead of fit-all, with the "show whole tree" button still available. Needs your call.
2. **#10 touch target "never below ~24 px screen radius even zoomed out".** At fit-all zoom for 150+ people, hundreds of 48 px targets overlap, so it is physically unsatisfiable. Suggested: guarantee the target only when zoom is at or above the "initial only" bucket; in the dot bucket use nearest-person hit-testing and require zooming in to act. Needs your call.
3. **#10 "No minimap in v1; revisit if big trees are hard to navigate."** This research says: not needed up to ~200; for 1,000+ the crown is ~10,000+ px wide and navigation by pan alone is slow. Recommendation: keep no minimap in v1, rely on Focus-person button, chip navigation and a search-to-jump (check whether a Search ticket exists); revisit after the 1,000-person real-phone test.
4. **#7 leaf-hiding threshold** is confirmed and should be one of the LOD bucket edges (section 3.2). No change to visuals.
5. **#7 "round crown" wide aspect at scale** compounds item 1; no layout change proposed here.
6. **#2 / #6 / #3:** consistent: SVG kept, no canvas, layout separate (makes the Worker option cheap), Zustand per-person selectors fit, IndexedDB single JSON doc is fine at 5,000 persons (text-only JSON is on the order of a few MB [I]); photos stay in a separate store. No change.
7. **New requirement for the layout module:** pure, DOM-free, returns flat typed arrays, supports a warm start. Add to the layout build ticket.

## Open items / caveats
- All thresholds in sections 2 and 4 are estimates until measured; no mobile benchmark of SVG element counts was found in primary sources.
- Genealogy size statistics are old secondary reports.
- SVG `<image>` lazy/async decoding behaviour not confirmed in MDN.
