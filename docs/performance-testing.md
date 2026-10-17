# Performance testing

Where the budget of spec section 9 is checked, what the checks can and cannot tell you, and the one check that needs a real phone.

The budget numbers live in one file, `src/config/perf-budget.ts`. Fixtures come from `src/layout/fixtures.ts` (`generateTree(size, seed)`, the same Tree for the same seed).

## What runs where

| Check | Command | What it measures |
| --- | --- | --- |
| Layout bench | `npm run bench` | `layoutTree` on 200 / 1,000 / 5,000 people in Node, times 4 for the throttle, against `layoutComputeMs`. Also: a warm start is faster than a cold one. |
| Browser budget | `npm run e2e` (project `perf`, `e2e/perf.spec.ts`) | At 4x CPU throttle and a 390 px viewport, for 200 / 1,000 / 5,000 people: pan and zoom p95 frame time, first paint, layout, and edit to redraw. |
| Worker path | unit: `src/layout/layoutWorker.test.ts`; browser: the last two tests of `perf.spec.ts` | The Worker produces the same layout, transfers its buffers, warm-starts, and falls back to the page when it fails. Above 1,000 people a Worker really starts; at 1,000 or fewer none does. |

The `perf` project runs after the others and alone, because other tests running at the same time steal CPU from a measurement taken under throttle. It runs on Chromium only: the throttle is a Chrome DevTools Protocol call.

## How the numbers are taken

- **Throttle.** `Emulation.setCPUThrottlingRate` with `rate: 4` (`PERF_BUDGET.throttleCpuRate`). `perf.spec.ts` first checks that it does slow the page: a fixed loop ran about 3.2x slower with the rate set to 4 (71 ms to 226 ms on the machine this was written on), and the test requires at least 2.5x.
- **Frame time.** The gaps between `requestAnimationFrame` callbacks while a scripted drag and wheel zoom run. The p95 gap is compared to the budget plus 2 ms, which is the pacing jitter of a headless browser, not slow frames. Long tasks (over 50 ms) are counted and the longest is printed.
- **First paint.** From the start of the page load until the first Person is in the DOM (a script that runs before the page, with a `MutationObserver`).
- **Layout.** The `family-tree:layout` performance measure the app records for each layout: from asking for it until it is ready, including the trip to the Worker.
- **Edit to redraw.** From the click on Save until a Person with the new name is on the screen and a frame has been drawn.
- Layout, first paint and edit to redraw are each the **median of three runs**. A single run of a small Tree varies by about 20 ms.

## What the throttle does not do

**The CPU throttle does not reach Web Workers.** A loop that took 51 ms in a Worker took 47 ms with the rate set to 4 (a test in `perf.spec.ts` prints this). So for a Tree above 1,000 people, the browser's layout and edit-to-redraw figures leave out the slowdown of the Worker's own computing. Two things make up for it:

- The Node bench (`npm run bench`) multiplies the single-threaded layout time by 4, which is the figure that stands for a slow phone's Worker: 5,000 people took about 75 ms, so about 300 ms against a 1,500 ms budget.
- For the edit to redraw at 5,000 people, adding the missing slowdown of the Worker (3 x about 75 ms) to the measured figure still leaves it under its 1,000 ms budget.

Also: 4x throttling a fast desktop is not a phone. It does not slow the GPU, memory or the network, and a low-end phone may be slower than 4x. That is why there is a real-phone check.

## Results when this was written

Machine: a desktop, Chromium under 4x throttle at 390 px. Budget in brackets.

| People | Pan/zoom p95 | First paint | Layout | Edit to redraw |
| --- | --- | --- | --- | --- |
| 200 | 16.7 ms (16.7) | 360 ms (1,000) | 36 ms (50) | 68 ms (100) |
| 1,000 | 16.8 ms (20) | 650 ms (2,000) | 141 ms (200) | 142 ms (300) |
| 5,000 | 16.8 ms (33) | 1,120 ms (5,000) | 286 ms (1,500)* | 507 ms (1,000)* |

\* Includes a Worker that was not throttled; see above. Pan and zoom at 5,000 people had 6 long tasks, the longest about 90 ms: the redraws when the screen leaves the part of the Tree that is drawn.

Run to run the 200-person layout varies between about 34 and 58 ms, which is why the test uses the median of three.

## Real-phone check at 1,000 people (do this once before release)

This is the only check on real hardware. It also decides whether a minimap is revisited (spec section 12, point 3).

1. Build and serve the app on your network: `npm run build && npm run preview -- --host`. Open it on the phone (use the oldest or cheapest phone you care about; note its model and browser).
2. Put a 1,000-person Tree on it: write a file with `serializeDocument(generateTree(1000, 1))` (see `e2e/seed.ts`), move it to the phone, and import it in Settings.
3. Reload the page with the Tree saved. Count the seconds until the Tree is drawn. Budget: 2 s.
4. Pan with one finger and pinch to zoom for 20 seconds, from fit-all down to the readable size. Note whether it feels smooth, and where it stutters (zooming across the level-of-detail steps is the likely place).
5. Open a Person, edit the name, save. Budget: the new name on screen within 300 ms.
6. Try to find a Person who is far from the Focus person using only the Focus button, the relative chips in the panel, and Search. Note how long it takes and whether you would have wanted a minimap.
7. Write the result (phone, browser, numbers, the feel, the minimap answer) at the end of this file, with the date.

### Results

_Not done yet._
