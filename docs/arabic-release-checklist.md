# Arabic release checklist

Arabic is offered only when every item below is done and recorded (spec section 13.8). The release is adding Arabic to `AVAILABLE_LANGUAGES` in `src/i18n/language.ts`.

The owner is a native speaker and reviews the Arabic. Nothing here is signed off yet. Items marked "to come" depend on a build ticket that has not been done; that ticket fills them in.

## 1. The kinship table

The table is `docs/spec/arabic-relationship-labels.md`, implemented in `src/domain/labelsAr.ts`. Every row below is marked (K) (written from knowledge, no cited source) or UNSURE in the table. Clear each one: confirm it, or give the word that should replace it, and the table and the code follow. Record the date and any change next to the row.


### Partners

- [ ] partner, current: زوج / زوجة / شريك الحياة — (K)
- [ ] partner, ended: زوج سابق / زوجة سابقة / شريك سابق — (K)

### Parents, children, siblings

- [ ] up 1, down 0: أب / أم / أحد الوالدين — (S) M, F; (K) N
- [ ] up 0, down 1: ابن / ابنة / ولد — (S) M; (K) F, N
- [ ] half, shared parent female: أخ لأم / أخت لأم / أخ/أخت لأم — (K)
- [ ] half, shared parent's gender unknown: أخ غير شقيق / أخت غير شقيقة / أخ/أخت غير شقيق/شقيقة — (K)

### Grandparents, grandchildren and "great-" lines

- [ ] up ≥ 3, down 0 (`n` = up): جد من الدرجة {n} / جدة من الدرجة {n} / جد/جدة من الدرجة {n} — (K), UNSURE
- [ ] up 0, down 2: حفيد / حفيدة / حفيد/حفيدة — (S) M, F; UNSURE N
- [ ] up 0, down ≥ 3 (`n` = down): حفيد من الدرجة {n} / حفيدة من الدرجة {n} / حفيد/حفيدة من الدرجة {n} — (K), UNSURE

### Uncles and aunts

- [ ] up 2, down 1, side unknown: عم أو خال / عمة أو خالة / عم/عمة أو خال/خالة — (K), UNSURE
- [ ] up ≥ 3, down 1, paternal (`n` = up − 1): عم من الدرجة {n} / عمة من الدرجة {n} / عم/عمة من الدرجة {n} — (K), UNSURE
- [ ] up ≥ 3, down 1, maternal: خال من الدرجة {n} / خالة من الدرجة {n} / خال/خالة من الدرجة {n} — (K), UNSURE
- [ ] up ≥ 3, down 1, side unknown: قريب من الدرجة {n} / قريبة من الدرجة {n} / قريب/قريبة من الدرجة {n} — (K), UNSURE

### Nephews and nieces

- [ ] up 1, down 2, through a brother (widened): ابن الأخ / ابنة الأخ / ولد الأخ — (S) M, F; (K) N
- [ ] up 1, down 2, through a sister: ابن الأخت / ابنة الأخت / ولد الأخت — (S) M, F; (K) N
- [ ] up 1, down 2, sibling's gender unknown: ابن الأخ/الأخت / ابنة الأخ/الأخت / ولد الأخ/الأخت — (K)
- [ ] up 1, down ≥ 3 (`n` = down − 1), through a brother: ابن الأخ من الدرجة {n} / ابنة الأخ من الدرجة {n} / ولد الأخ من الدرجة {n} — (K), UNSURE
- [ ] up 1, down ≥ 3, through a sister: ابن الأخت من الدرجة {n} / ابنة الأخت من الدرجة {n} / ولد الأخت من الدرجة {n} — (K), UNSURE
- [ ] up 1, down ≥ 3, sibling's gender unknown: ابن الأخ/الأخت من الدرجة {n} / ابنة الأخ/الأخت من الدرجة {n} / ولد الأخ/الأخت من الدرجة {n} — (K), UNSURE

### Cousins

- [ ] through father's brother: ابن عم / ابنة عم / ولد العم — (S) M; (K) F, N
- [ ] through father's sister: ابن عمة / ابنة عمة / ولد العمة — (K)
- [ ] through mother's brother: ابن خال / ابنة خال / ولد الخال — (S) M; (K) F, N
- [ ] through mother's sister: ابن خالة / ابنة خالة / ولد الخالة — (K)
- [ ] first cousin, the parent's sibling's gender unknown: قريب / قريبة / قريب/قريبة — (K), UNSURE
- [ ] second and further cousins, no removal (`n` = degree): ابن عم من الدرجة {n} / ابنة عم من الدرجة {n} / قريب/قريبة من الدرجة {n} — (K), UNSURE (ignores the side)
- [ ] any "removed" cousin: قريب / قريبة / قريب/قريبة — (K)

### Step relatives (dormant in the v1 interface; unreviewed)

- [ ] step parent: زوج الأم / زوجة الأب / زوج الأم/زوجة الأب — (S) M, F; (K) N
- [ ] step child: ربيب / ربيبة / ربيب/ربيبة — (S), UNSURE (strictly a wife's child by another man)

### In-laws

- [ ] child's partner, child male (widened): زوج الابن / زوجة الابن / شريك الابن — (K)
- [ ] child's partner, child female: زوج الابنة / زوجة الابنة / شريك الابنة — (K)
- [ ] child's partner, child's gender unknown: زوج الولد / زوجة الولد / شريك الولد — (K)
- [ ] partner's sibling, partner male (widened): شقيق الزوج / شقيقة الزوج / شقيق/شقيقة الزوج — (K)
- [ ] partner's sibling, partner female: شقيق الزوجة / شقيقة الزوجة / شقيق/شقيقة الزوجة — (K)
- [ ] partner's sibling, partner's gender unknown: شقيق الشريك / شقيقة الشريك / شقيق/شقيقة الشريك — (K)
- [ ] sibling's partner, sibling male (widened): زوج الأخ / زوجة الأخ / شريك الأخ — (K)
- [ ] sibling's partner, sibling female: زوج الأخت / زوجة الأخت / شريك الأخت — (K)
- [ ] sibling's partner, sibling's gender unknown: زوج الأخ/الأخت / زوجة الأخ/الأخت / شريك الأخ/الأخت — (K)

### Partner of an uncle or aunt (`uncle-partner`, widened with the uncle's or aunt's side and gender)

- [ ] paternal uncle: زوج العم / زوجة العم / شريك العم — (K), UNSURE (the owner may prefer the everyday عمة/خالة)
- [ ] paternal aunt: زوج العمة / زوجة العمة / شريك العمة — (K), UNSURE
- [ ] maternal uncle: زوج الخال / زوجة الخال / شريك الخال — (K), UNSURE
- [ ] maternal aunt: زوج الخالة / زوجة الخالة / شريك الخالة — (K), UNSURE
- [ ] side or gender unknown: قريب / قريبة / قريب/قريبة — (K)

### Everyone else

- [ ] other (connected, no word): قريب / قريبة / قريب/قريبة — (K)
- [ ] unconnected: غير مرتبط / غير مرتبطة / غير مرتبط/ة — (K), UNSURE

## 2. The interface text

- [ ] The owner has read and edited every string of the Arabic dictionary (`src/i18n/messages.ts`), including the proposed field labels الاسم الأول / اسم العائلة and the death abbreviation "ت." (to come: the dictionary is written by "Arabic interface text").

## 3. Real devices

- [ ] The real-phone check that Arabic fonts render (Android and iPhone), with the 1,000-person Arabic Tree: steps and results recorded in `docs/performance-testing.md` (to come: "Arabic tests and release checklist" adds the steps).

## 4. Screens

- [ ] The screenshot pass of the right-to-left screens at phone and desktop widths (tree, open Person, list, Settings, the add and edit forms).

## 5. The automatic checks

- [ ] CI is green, including the Arabic Playwright projects (to come: "Arabic tests and release checklist" adds them).
