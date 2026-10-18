# Arabic relationship labels

The final table for section 13.6 of the [build spec](family-tree-spec.md): what `labelFor(descriptor, gender, 'ar')` returns. It applies the decisions of [Arabic relationship labels: table and grammar](https://github.com/kalnaasan/Family-Tree/issues/47) to the research on the branch `research/arabic-kinship-terms` (`docs/research/arabic-kinship-terms.md`, with its sources).

**This is a draft for the owner's review.** Nothing here ships until the owner has signed off every row marked (K) or UNSURE (see the sign-off list at the end). Modern Standard Arabic only.

## How to read it

- **M / F / N** is the gender of the Person being labelled: male, female, unknown (neutral).
- **Confidence:** (S) the term was found in a cited source; (K) standard Arabic written from knowledge, not cited; UNSURE contested or guessed. A row takes its weakest mark.
- Words in `{braces}` are filled in by the code. `{n}` is the ordinal in feminine form (`الثانية` 2nd, `الثالثة` 3rd, `الرابعة`, `الخامسة`, `السادسة`, `السابعة`, `الثامنة`, `التاسعة`, `العاشرة`); above ten, the digits are written (`من الدرجة 12`).
- "Widened" means the descriptor field added by the ticket (the gender of a relative the link passes through). Where that gender is unknown, use the row's "unknown" line.
- The Focus person has no label.

## Partners

| Descriptor | English (M / F / N) | Arabic M | Arabic F | Arabic N | Confidence |
| --- | --- | --- | --- | --- | --- |
| partner, current | husband / wife / partner | زوج | زوجة | شريك الحياة | (K) |
| partner, ended | ex-husband / ex-wife / ex-partner | زوج سابق | زوجة سابقة | شريك سابق | (K) |

## Parents, children, siblings

| Descriptor | English | Arabic M | Arabic F | Arabic N | Confidence |
| --- | --- | --- | --- | --- | --- |
| up 1, down 0 | father / mother / parent | أب | أم | أحد الوالدين | (S) M, F; (K) N |
| up 0, down 1 | son / daughter / child | ابن | ابنة | ولد | (S) M; (K) F, N |
| up 1, down 1, full | brother / sister / sibling | أخ | أخت | أخ/أخت | (S) |
| half, shared parent male | half-brother / half-sister / half-sibling | أخ لأب | أخت لأب | أخ/أخت لأب | (S) |
| half, shared parent female | same | أخ لأم | أخت لأم | أخ/أخت لأم | (K) |
| half, shared parent's gender unknown | same | أخ غير شقيق | أخت غير شقيقة | أخ/أخت غير شقيق/شقيقة | (K) |

## Grandparents, grandchildren and "great-" lines

| Descriptor | English | Arabic M | Arabic F | Arabic N | Confidence |
| --- | --- | --- | --- | --- | --- |
| up 2, down 0 | grandfather / grandmother / grandparent | جد | جدة | جد/جدة | (S) |
| up ≥ 3, down 0 (`n` = up) | great-grandfather … | جد من الدرجة {n} | جدة من الدرجة {n} | جد/جدة من الدرجة {n} | (K), UNSURE |
| up 0, down 2 | grandson / granddaughter / grandchild | حفيد | حفيدة | حفيد/حفيدة | (S) M, F; UNSURE N |
| up 0, down ≥ 3 (`n` = down) | great-grandson … | حفيد من الدرجة {n} | حفيدة من الدرجة {n} | حفيد/حفيدة من الدرجة {n} | (K), UNSURE |

Degrees in the direct line count generations as Arabic inheritance law does: a parent is the first degree, a grandparent the second, a great-grandparent the third, and the same downwards for grandchildren. For an uncle, a nephew or a cousin the number is the generations beyond the first step (a great-uncle and a second cousin are both "the second"; the word before it tells them apart).

## Uncles and aunts

| Descriptor | English | Arabic M | Arabic F | Arabic N | Confidence |
| --- | --- | --- | --- | --- | --- |
| up 2, down 1, side paternal | uncle / aunt / uncle/aunt | عم | عمة | عم/عمة | (S) |
| up 2, down 1, side maternal | same | خال | خالة | خال/خالة | (S) |
| up 2, down 1, side unknown | same | عم أو خال | عمة أو خالة | عم/عمة أو خال/خالة | (K), UNSURE |
| up ≥ 3, down 1, paternal (`n` = up − 1) | great-uncle / great-aunt | عم من الدرجة {n} | عمة من الدرجة {n} | عم/عمة من الدرجة {n} | (K), UNSURE |
| up ≥ 3, down 1, maternal | same | خال من الدرجة {n} | خالة من الدرجة {n} | خال/خالة من الدرجة {n} | (K), UNSURE |
| up ≥ 3, down 1, side unknown | same | قريب من الدرجة {n} | قريبة من الدرجة {n} | قريب/قريبة من الدرجة {n} | (K), UNSURE |

## Nephews and nieces

| Descriptor | English | Arabic M | Arabic F | Arabic N | Confidence |
| --- | --- | --- | --- | --- | --- |
| up 1, down 2, through a brother (widened) | nephew / niece / nephew/niece | ابن الأخ | ابنة الأخ | ولد الأخ | (S) M, F; (K) N |
| up 1, down 2, through a sister | same | ابن الأخت | ابنة الأخت | ولد الأخت | (S) M, F; (K) N |
| up 1, down 2, sibling's gender unknown | same | ابن الأخ/الأخت | ابنة الأخ/الأخت | ولد الأخ/الأخت | (K) |
| up 1, down ≥ 3 (`n` = down − 1), through a brother | great-nephew / great-niece | ابن الأخ من الدرجة {n} | ابنة الأخ من الدرجة {n} | ولد الأخ من الدرجة {n} | (K), UNSURE |
| up 1, down ≥ 3, through a sister | same | ابن الأخت من الدرجة {n} | ابنة الأخت من الدرجة {n} | ولد الأخت من الدرجة {n} | (K), UNSURE |
| up 1, down ≥ 3, sibling's gender unknown | same | ابن الأخ/الأخت من الدرجة {n} | ابنة الأخ/الأخت من الدرجة {n} | ولد الأخ/الأخت من الدرجة {n} | (K), UNSURE |

## Cousins

A first cousin is up 2, down 2. The word depends on the gender of the parent's sibling the cousin comes through, which the widened descriptor records.

| Descriptor | English | Arabic M | Arabic F | Arabic N | Confidence |
| --- | --- | --- | --- | --- | --- |
| through father's brother | cousin | ابن عم | ابنة عم | ولد العم | (S) M; (K) F, N |
| through father's sister | cousin | ابن عمة | ابنة عمة | ولد العمة | (K) |
| through mother's brother | cousin | ابن خال | ابنة خال | ولد الخال | (S) M; (K) F, N |
| through mother's sister | cousin | ابن خالة | ابنة خالة | ولد الخالة | (K) |
| first cousin, the parent's sibling's gender unknown | cousin | قريب | قريبة | قريب/قريبة | (K), UNSURE |
| second and further cousins, no removal (`n` = degree) | 2nd cousin … | ابن عم من الدرجة {n} | ابنة عم من الدرجة {n} | قريب/قريبة من الدرجة {n} | (K), UNSURE (ignores the side) |
| any "removed" cousin | cousin once / twice / n times removed | قريب | قريبة | قريب/قريبة | (K) |

## Step relatives (dormant in the v1 interface; unreviewed)

| Descriptor | English | Arabic M | Arabic F | Arabic N | Confidence |
| --- | --- | --- | --- | --- | --- |
| step parent | stepfather / stepmother / step-parent | زوج الأم | زوجة الأب | زوج الأم/زوجة الأب | (S) M, F; (K) N |
| step child | stepson / stepdaughter / stepchild | ربيب | ربيبة | ربيب/ربيبة | (S), UNSURE (strictly a wife's child by another man) |

## In-laws

| Descriptor | English | Arabic M | Arabic F | Arabic N | Confidence |
| --- | --- | --- | --- | --- | --- |
| partner's parent | father-in-law / mother-in-law / parent-in-law | حم | حماة | حم/حماة | (S) |
| child's partner, child male (widened) | son-in-law / daughter-in-law / child-in-law | زوج الابن | زوجة الابن | شريك الابن | (K) |
| child's partner, child female | same | زوج الابنة | زوجة الابنة | شريك الابنة | (K) |
| child's partner, child's gender unknown | same | زوج الولد | زوجة الولد | شريك الولد | (K) |
| partner's sibling, partner male (widened) | brother-in-law / sister-in-law / sibling-in-law | شقيق الزوج | شقيقة الزوج | شقيق/شقيقة الزوج | (K) |
| partner's sibling, partner female | same | شقيق الزوجة | شقيقة الزوجة | شقيق/شقيقة الزوجة | (K) |
| partner's sibling, partner's gender unknown | same | شقيق الشريك | شقيقة الشريك | شقيق/شقيقة الشريك | (K) |
| sibling's partner, sibling male (widened) | same | زوج الأخ | زوجة الأخ | شريك الأخ | (K) |
| sibling's partner, sibling female | same | زوج الأخت | زوجة الأخت | شريك الأخت | (K) |
| sibling's partner, sibling's gender unknown | same | زوج الأخ/الأخت | زوجة الأخ/الأخت | شريك الأخ/الأخت | (K) |

Not used, because each is ambiguous or loose: حمو (father-in-law and brother-in-law), صهر, نسيب, عديل, سلفة.

## Partner of an uncle or aunt (`uncle-partner`, widened with the uncle's or aunt's side and gender)

| The uncle or aunt is | English | Arabic M | Arabic F | Arabic N | Confidence |
| --- | --- | --- | --- | --- | --- |
| paternal uncle | uncle / aunt | زوج العم | زوجة العم | شريك العم | (K), UNSURE (the owner may prefer the everyday عمة/خالة) |
| paternal aunt | same | زوج العمة | زوجة العمة | شريك العمة | (K), UNSURE |
| maternal uncle | same | زوج الخال | زوجة الخال | شريك الخال | (K), UNSURE |
| maternal aunt | same | زوج الخالة | زوجة الخالة | شريك الخالة | (K), UNSURE |
| side or gender unknown | same | قريب | قريبة | قريب/قريبة | (K) |

## Everyone else

| Descriptor | English | Arabic M | Arabic F | Arabic N | Confidence |
| --- | --- | --- | --- | --- | --- |
| other (connected, no word) | Relative | قريب | قريبة | قريب/قريبة | (K) |
| unconnected | Not connected | غير مرتبط | غير مرتبطة | غير مرتبط/ة | (K), UNSURE |

## Owner sign-off

Before Arabic is offered (spec section 13.8), the owner confirms each group below. Record the date and any changes here.

- [ ] Partners
- [ ] Parents, children, siblings, half-siblings
- [ ] Grandparents, grandchildren and "great-" lines (the degree form)
- [ ] Uncles and aunts
- [ ] Nephews and nieces
- [ ] Cousins (including second and "removed")
- [ ] Step relatives
- [ ] In-laws
- [ ] Partner of an uncle or aunt (literal or everyday forms)
- [ ] Fallbacks
