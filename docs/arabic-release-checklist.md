# Arabic release checklist

Arabic is offered only when every item below is done and recorded (spec section 13.8). The release is adding Arabic to `AVAILABLE_LANGUAGES` in `src/i18n/language.ts`.

The owner is a native speaker and reviews the Arabic. Nothing here is signed off yet. Each item has a place for the date and the result: write both when it is done, and leave the box unticked until then.

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

The dictionary is `src/i18n/messages.ts` (`ar`). It is a draft in Modern Standard Arabic: read each group in the app (switch the Language in a test build, or run `npm run e2e -- --project=chromium-ar` and open the screens) and edit the strings. The build fails if a key is missing or a plural message lacks one of its six forms, so editing a string is safe.

For each group: ticked when read and edited; date and result beside it.

- [ ] The page: title, Settings, List view, the load errors. Date: ____ Result: ____
- [ ] Language setting: "اللغة", "مثل المتصفح". Date: ____ Result: ____
- [ ] Saving and the backup banner (`save.*`, `backupBanner.*`, `readOnly.*`), including the plural "n changes since the last backup". Date: ____ Result: ____
- [ ] First run (`empty.*`). Date: ____ Result: ____
- [ ] History, toasts and step names (`history.*`, `toast.*`, `step.*`): "تم التراجع عن: …", "تم حذف … مع …". Date: ____ Result: ____
- [ ] Words for a relative when adding one (`relation.*`). Date: ____ Result: ____
- [ ] Counts and sizes (`common.people`, `common.photos`, `size.*`): all six plural forms. Date: ____ Result: ____
- [ ] Settings: storage and photos (`settings.*`). Date: ____ Result: ____
- [ ] Backup, import and restore (`backup.*`, `restore.*`). Date: ____ Result: ____
- [ ] The Person form: first name, last name, gender, dates (`fields.*`, `gender.*`, `person.*`), including the proposed labels الاسم الأول / اسم العائلة. Date: ____ Result: ____
- [ ] Adding a relative and its preview (`addForm.*`, `preview.*`, `addRelative.*`), including the pattern "{relation} {name}" (no prefix glued to a name). Date: ____ Result: ____
- [ ] Keyboard announcements (`nav.*`), including the plural of children. Date: ____ Result: ____
- [ ] Photos and cropping (`photo.*`, `crop.*`). Date: ____ Result: ____
- [ ] The tree: its label, its keyboard hint, zoom buttons, "الشخص المحوري" for the Focus person (`tree.*`, `person.focus`). Date: ____ Result: ____
- [ ] Search and the List view (`search.*`, `list.*`). Date: ____ Result: ____
- [ ] The Person panel (`panel.*`). Date: ____ Result: ____

Strings the draft is least sure of, to look at first:

- [ ] "غير شقيق" and "شريك الحياة" (partner), and the parent-link and partnership terms ("صلة والدية", "شراكة"). Date: ____ Result: ____
- [ ] The date labels "الميلاد: {year}" / "الوفاة: {year}", and the compact "ت. {year}" on a tree node (`life.died`). Date: ____ Result: ____
- [ ] "تولَّ التعديل" (take over editing) and the read-only banner. Date: ____ Result: ____
- [ ] The masculine/feminine pair "متوفى/متوفاة" and "ولد" for a child of unknown gender. Date: ____ Result: ____
- [ ] The tree's keyboard hint (`tree.hint`) read aloud with a screen reader. Date: ____ Result: ____

## 3. Real devices

Steps (also in `docs/performance-testing.md`, "Arabic on a real phone"). Do them on each of an Android phone and an iPhone:

1. Open the build with Arabic offered (set `family-tree.language` to `ar` in the page's storage, or release it on a preview).
2. Load a 1,000-person Arabic Tree (the `names: 'arabic'` fixture; import the backup file the steps in `docs/performance-testing.md` produce).
3. Check that every Arabic letter renders in a real font (no boxes, no Latin fallback look), at the tree's full detail, in the list, in the panel and in Settings; and that vowel marks sit on their letters.
4. Pan and zoom the tree; type an Arabic name into search and the forms.

- [ ] Android phone: model and browser ____ Date: ____ Result: ____
- [ ] iPhone: model and iOS version ____ Date: ____ Result: ____

## 4. Screens

The screenshot pass of the right-to-left screens, at a phone width (390 px) and a desktop width (1280 px). Look for anything clipped, overlapping, wrongly mirrored or reading the wrong way.

- [ ] The tree (phone / desktop). Date: ____ Result: ____
- [ ] An open Person: the panel, the sheet at peek and expanded. Date: ____ Result: ____
- [ ] The List view. Date: ____ Result: ____
- [ ] Settings: storage, backup, restore, the Language setting. Date: ____ Result: ____
- [ ] The add-a-relative and edit forms, and the crop dialog. Date: ____ Result: ____
- [ ] The toast, the backup banner, the read-only banner. Date: ____ Result: ____

## 5. The automatic checks

- [ ] CI is green, including the Arabic Playwright projects: `chromium-ar` and `webkit-ar` re-run smoke, tree, keyboard, add-relative, search, backup, undo, touch and photos with the Language set to Arabic, and `rtl-arabic.spec.ts` repeats the right-to-left checks (mirroring, key swap, overflow at 390 px, axe) in real Arabic. Date: ____ Result: ____
- [ ] The Arabic-names variant of the performance test (1,000 and 5,000 people) is within the same budget (`npx playwright test --project=perf`). Date: ____ Result: ____
- [ ] The release gate still holds before the change: `language.spec.ts` shows an Arabic browser still gets English. Date: ____ Result: ____

## The release

When every box above is ticked, add `'ar'` to `AVAILABLE_LANGUAGES` in `src/i18n/language.ts`. That change is the release (spec section 13.8).
