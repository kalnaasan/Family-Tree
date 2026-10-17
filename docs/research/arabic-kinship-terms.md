# Arabic kinship terms in Modern Standard Arabic

Research for issue #46 (part of map issue #45). Question: which Modern Standard Arabic (MSA) words cover every relationship `src/domain/labels.ts` can produce, and what does Arabic do where English has a regular rule (`great-`, `once removed`)?

Status: a draft for the owner to review. This is a table, not code. Confidence is marked per row; anything I could not verify against a source is tagged **UNSURE**.

## How reliable is this

- Source access was limited. Wikipedia and Wiktionary fetches returned 404, and the web search results were mostly learner glossaries. Terms found in a cited source are marked **(S)**. Standard MSA that I know but did not find in a cited source is marked **(K)** and needs a native-speaker check. **UNSURE** means contested or guessed.
- Transliteration is simplified: macrons are dropped, `'` is hamza, `ʿ` is ayn.
- A native Arabic speaker (ideally from the owner's family) should review the final table.

## Finding 1: the descriptor does not carry everything Arabic needs

`RelationDescriptor` plus the Person's own gender is enough for English. Arabic distinguishes more, and several distinctions are **not recoverable from the descriptor** as it stands:

| Arabic needs | Where it matters | In the descriptor today? |
|---|---|---|
| Gender of the **uncle/aunt** (the parent's sibling) | Cousins: ابن عم, ابن عمة, ابن خال, ابن خالة | No. `side` records only the gender of the Focus person's own parent. |
| Gender of the **sibling** whose child this is | Nephew/niece: ابن الأخ vs ابن الأخت | No. `side` is about the Focus person's parent, not the sibling. |
| Which **shared parent** a half-sibling has | أخ لأب (shared father) vs أخ لأم (shared mother) | No. `half` is a boolean. |
| Gender of the **intermediate child** | Grandchild: ابن الابن vs ابن البنت | No. |
| Gender of **intermediate ancestors** beyond the first | Great-grandparents, great-uncles/aunts (جد الأب vs جد الأم ...) | No. Only the first step (`side`) is kept. |
| Whether the partner belongs to an **uncle or aunt**, and which side | `uncle-partner`: زوجة العم / زوجة الخال / زوج العمة / زوج الخالة | No. `uncle-partner` has no `side`. |

Uncles and aunts are the exception: `side` plus the Person's own gender is enough. Everything else above needs the descriptor widened, or the Arabic lookup restricted to generic/fallback forms. This is the biggest decision for the owner (see Open questions).

## Finding 2: Arabic spells out the path; it has few "depth" words

Arabic kinship is **descriptive and recursive**: a relative is named by chaining genitive (idafa) constructions, e.g. ابن عم الأب "son of the father's paternal uncle". There is no productive prefix like `great-` and no concept of "cousin once removed". See the Depth section.

## Table: every descriptor `labelFor` can produce

"EN" is the string from `labels.ts`. M = Person gender `male`, F = `female`, N = `unknown`.

### Self, partner, ex-partner

| Descriptor | EN (M / F / N) | Arabic M | Translit | Arabic F | Translit | Arabic N | Translit | Source / notes |
|---|---|---|---|---|---|---|---|---|
| `self` | no label | - | - | - | - | - | - | None shown. |
| `partner`, ex=false | husband / wife / partner | زوج | zawj | زوجة | zawja | شريك الحياة | sharik al-hayah | (K). زوج/زوجة is the standard married pair. زوج is used for a spouse of either sex in Classical Arabic (the Qur'an), but in MSA it reads as "husband", so it is not a safe neutral. شريك الحياة ("life partner") is neutral in meaning though grammatically masculine; plain شريك suggests "business partner". UNSURE which the owner prefers. |
| `partner`, ex=true | ex-husband / ex-wife / ex-partner | طليق (or زوج سابق) | taliq (zawj sabiq) | طليقة (or زوجة سابقة) | taliqa (zawja sabiqa) | شريك سابق | sharik sabiq | (K). طليق/طليقة implies a **divorce**. The app's "ended Partnership" may be a separation or an unmarried partnership, so the "former" forms (سابق/سابقة) are safer. Owner decision. |

### Parents, children, siblings (full and half)

| Descriptor | EN | Arabic M | Translit | Arabic F | Translit | Arabic N | Translit | Source / notes |
|---|---|---|---|---|---|---|---|---|
| up=1 down=0 | father / mother / parent | أب (formal: والد) | ab (walid) | أم (formal: والدة) | umm (walida) | **No single-person neutral.** Use أحد الوالدين ("one of the parents") or the slash form أب/أم. الوالدان is dual ("both parents"). | ahad al-walidayn | (S) Al Jazeera lists الأب / الأم / الوالدان. Neutral phrase (K). |
| up=0 down=1 | son / daughter / child | ابن | ibn | ابنة or بنت | ibna / bint | ولد (plural أولاد) | walad | (S) الابن / البنت. ولد means a child of either sex, so it works as neutral (K). |
| up=1 down=1, half=false | brother / sister / sibling | أخ (full: شقيق) | akh (shaqiq) | أخت (full: شقيقة) | ukht (shaqiqa) | **None in the singular.** Use أخ/أخت. The plural إخوة (mixed group) is neutral but plural. | akh / ukht | (S) الأخ / الأخت. شقيق/شقيقة = full sibling (K). |
| up=1 down=1, half=true | half-brother / half-sister / half-sibling | أخ لأب (shared father) or أخ لأم (shared mother); vague: أخ غير شقيق | akh li-ab / akh li-umm / akh ghayr shaqiq | أخت لأب or أخت لأم; vague: أخت غير شقيقة | ukht li-ab / ukht li-umm / ukht ghayr shaqiqa | أخ/أخت لأب (or لأم) | as left | (S) Al Jazeera lists أخ لأب and أخت لأب. **لأم is not on that page** and is (K): it is the standard pairing in inheritance law. Arabic needs the shared parent stated (Finding 1). |

### Grandparents, grandchildren, great- lines

| Descriptor | EN | Arabic M | Translit | Arabic F | Translit | Arabic N | Translit | Source / notes |
|---|---|---|---|---|---|---|---|---|
| up=2 down=0 | grandfather / grandmother / grandparent | جد | jadd | جدة | jadda | **None in the singular.** Use جد/جدة. The plural أجداد is neutral. | jadd / jadda | (S) الجد / الجدة / الأجداد. |
| up=2, paternal vs maternal | (same) | جد لأب / جد لأم; spoken: أبو الأب / أبو الأم | jadd li-ab / li-umm; abu al-ab / abu al-umm | جدة لأب / لأم; spoken: أم الأب / أم الأم | jadda li-ab / li-umm | - | - | (K). Arabic has **no separate word** for paternal vs maternal grandparents; it adds a phrase, and the distinction is optional (unlike uncle/aunt). The four grandparents need two steps of gender; the descriptor keeps one. |
| up=3 down=0 | great-grandfather / great-grandmother / great-grandparent | أبو الجد (or جد الأب, جد الأم) | abu al-jadd | أم الجد (or أبو الجدة ...) | umm al-jadd | **None.** جد/جدة أعلى | jadd a'la | (K), UNSURE which is most idiomatic. These are path-specific: أبو الجد is "father of the grandfather"; جد الأب is "grandfather of the father". Neither is a general "great-grandfather" word. |
| up>=4 down=0 | great-great-... | see Depth | | | | | | |
| up=0 down=2 | grandson / granddaughter / grandchild | حفيد | hafid | حفيدة | hafida | حفيد (generic use) | hafid | (S) الحفيد / الحفيدة / الأحفاد. Whether حفيد works as a neutral singular: UNSURE (grammatically masculine; the plural أحفاد is neutral). |
| up=0 down=2, via son vs daughter | (same) | ابن الابن / ابن البنت | ibn al-ibn / ibn al-bint | بنت الابن / بنت البنت | bint al-ibn / bint al-bint | | | (K). حفيد covers both in everyday MSA (a terminology source notes one school uses it for both son's and daughter's child). سبط (sibt) is traditionally a daughter's son (used for Hasan and Husayn), but I could not confirm the narrow sense: **UNSURE**; recommend not using it. |
| up=0 down=3 | great-grandson / great-granddaughter / great-grandchild | ابن الحفيد | ibn al-hafid | بنت الحفيد | bint al-hafid | | | (K), UNSURE. No fixed single word known to me. |
| up=0 down>=4 | great-great-... | see Depth | | | | | | |

### Uncles and aunts

| Descriptor | EN | Arabic M | Translit | Arabic F | Translit | Arabic N | Translit | Source / notes |
|---|---|---|---|---|---|---|---|---|
| up=2 down=1, side=paternal | uncle / aunt / uncle/aunt | عم | 'amm | عمة | 'amma | **None.** عم/عمة | 'amm / 'amma | (S) الأعمام / العمات, "paternal uncle/aunt". Arabic has no word for "uncle" without the side. |
| up=2 down=1, side=maternal | same | خال | khal | خالة | khala | **None.** خال/خالة | khal / khala | (S) الأخوال, "maternal uncle/aunt". |
| up=2 down=1, **side missing** (linking parent's gender unknown) | same | - | - | - | - | **No word.** Show both ("عم أو خال"), or fall back to قريب/قريبة | | The code produces this case. UNSURE what the owner wants shown. |
| up>=3 down=1 | great-uncle / great-aunt | عم الأب, عم الأم, خال الأب, خال الأم | 'amm al-ab ... | عمة الأب, خالة الأب ... | 'amma al-ab ... | | | (K), UNSURE. Named as "the uncle of [parent or grandparent]"; path-specific, and the single `side` is not enough. |
| `uncle-partner` | uncle / aunt (partner of an uncle/aunt) | زوج العمة / زوج الخالة | zawj al-'amma / zawj al-khala | زوجة العم / زوجة الخال | zawjat al-'amm / zawjat al-khal | - | | (K). Literal MSA is the "wife of the uncle" form; in speech people say عمة / خالة, which the English label mirrors. UNSURE which to use. The descriptor cannot tell عم from خال. |

### Nephews and nieces

| Descriptor | EN | Arabic M | Translit | Arabic F | Translit | Arabic N | Translit | Source / notes |
|---|---|---|---|---|---|---|---|---|
| up=1 down=2, **brother's child** | nephew / niece / nephew/niece | ابن الأخ | ibn al-akh | ابنة الأخ or بنت الأخ | ibnat al-akh / bint al-akh | ولد الأخ | walad al-akh | (S) Both brother's and sister's forms are listed in the Arabic Goals article. Neutral via ولد (K). |
| up=1 down=2, **sister's child** | same | ابن الأخت | ibn al-ukht | ابنة الأخت or بنت الأخت | ibnat al-ukht | ولد الأخت | walad al-ukht | (S). Different words, not interchangeable. The descriptor does not record the sibling's sex (Finding 1). |
| up=1 down>=3 | great-nephew / great-niece | حفيد الأخ / حفيد الأخت | hafid al-akh / al-ukht | حفيدة الأخ / الأخت | hafidat al-akh / al-ukht | | | (K), UNSURE. Built as حفيد + sibling; deeper = nested genitives. |

### Cousins (up>=2, down>=2)

A first cousin is `up=2, down=2`. The word depends on the sex of the parent's sibling, not on `side` alone.

| Cousin via | EN | Arabic M | Translit | Arabic F | Translit | Arabic N | Translit | Source / notes |
|---|---|---|---|---|---|---|---|---|
| father's brother | cousin | ابن عم | ibn 'amm | ابنة عم | ibnat 'amm | ولد العم | walad al-'amm | (S) Arabic Goals. Neutral via ولد (K). Collective: أبناء العم. |
| father's sister | cousin | ابن عمة | ibn 'amma | ابنة عمة | ibnat 'amma | ولد العمة | walad al-'amma | (K) |
| mother's brother | cousin | ابن خال | ibn khal | ابنة خال | ibnat khal | ولد الخال | walad al-khal | (S) |
| mother's sister | cousin | ابن خالة | ibn khala | ابنة خالة | ibnat khala | ولد الخالة | walad al-khala | (K) |
| path unknown | cousin | قريب | qarib | قريبة | qariba | قريب/ة | | Fallback if the parent's sibling's sex is not recorded. UNSURE. |

### Degree and removal

| EN | Arabic | Notes |
|---|---|---|
| 2nd cousin (up=3, down=3) | **No standard single word.** Descriptive: ابن ابن عم الأب ("son of the son of the father's paternal uncle"). A modern calque is ابن عم من الدرجة الثانية ("cousin of the second degree"). | UNSURE. No authoritative source found. The calque is understandable, not traditional. |
| Nth cousin | calque: ... من الدرجة N | UNSURE. |
| cousin once / twice / N times removed | **No word, no concept.** Named by the path: ابن ابن العم (cousin's son), ابن عم الأب (father's cousin), or just قريب. | (K). Recommended: use the descriptive chain where short, otherwise fall back to the existing "Relative" label (`other`) with the path in the detail panel. |

### Step relations (dormant in v1, kind `step`)

| Descriptor | EN | Arabic M | Translit | Arabic F | Translit | Arabic N | Translit | Source / notes |
|---|---|---|---|---|---|---|---|---|
| step parent | stepfather / stepmother / step-parent | زوج الأم | zawj al-umm | زوجة الأب | zawjat al-ab | **None.** | | (S) Al Jazeera. No single word: "mother's husband" / "father's wife". |
| step child | stepson / stepdaughter / stepchild | ربيب | rabib | ربيبة | rabiba | ربيب | rabib | (S) listed. Strictly ربيب is the **wife's** child by another man (K); for a husband's child by another wife the precise phrase differs. UNSURE. |

### In-laws (kind `in-law`)

Classically الأحماء are the husband's relatives, الأختان the wife's, and الأصهار both (K); modern use blurs this. Descriptive forms are safest where no single word is reliable.

| `via` | EN | Arabic M | Translit | Arabic F | Translit | Arabic N | Translit | Source / notes |
|---|---|---|---|---|---|---|---|---|
| `partner-parent` | father-in-law / mother-in-law / parent-in-law | حمو or حم (or أبو الزوج / أبو الزوجة) | hamw / ham | حماة | hamat | **None.** والد/والدة الزوج(ة) | walid(a) al-zawj(a) | (S) Arabic Goals gives حم and حماة. Al Jazeera gives الحمو as "father-in-law or brother-in-law": the same word covers both, so it is ambiguous. أبو الزوج/أبو الزوجة avoids that. UNSURE which the owner prefers. |
| `child-partner` | son-in-law / daughter-in-law / child-in-law | صهر or ختن (daughter's husband) | sihr / khatan | كنة | kanna | **None.** زوج الابنة / زوجة الابن | zawj al-ibna / zawjat al-ibn | (S) Al Jazeera: الختن son-in-law, الكنة daughter-in-law; a dictionary entry gives صهر as son-in-law/brother-in-law/relative. Arabic already encodes the child's sex: a male Person is a daughter's husband, a female Person is a son's wife. This breaks for a same-sex partner of a child. |
| `partner-sibling` | brother-in-law / sister-in-law / sibling-in-law | شقيق الزوج / شقيق الزوجة; loosely صهر, نسيب | shaqiq al-zawj / al-zawja | شقيقة الزوج / شقيقة الزوجة; dialect: سلفة | shaqiqat al-zawj / al-zawja | | | **No single reliable MSA word.** صهر is used loosely for a male in-law; نسيب means in-law/relative in general (dictionary: "in-law, relative"); سلفة is dialect and I could not confirm it (the ConceptNet hit concerns the root سلف, "predecessor"). Classical الحمو means the husband's brother. UNSURE. |
| `sibling-partner` | brother-in-law / sister-in-law / sibling-in-law | زوج الأخت | zawj al-ukht | زوجة الأخ | zawjat al-akh | | | (K) Descriptive. Both `partner-sibling` and `sibling-partner` give the same English word, but Arabic tells them apart. عديل appears in Al Jazeera's list, but the page's own English and French glosses disagree; UNSURE. |

### Fallbacks

| Descriptor | EN | Arabic M | Arabic F | Arabic N | Notes |
|---|---|---|---|---|---|
| `other` | Relative | قريب (qarib) | قريبة (qariba) | قريب/ة | (K). English does not gender this; Arabic can. |
| `unconnected` | Not connected | غير مرتبط (ghayr murtabit) | غير مرتبطة | غير مرتبط/ة | (K), UNSURE on exact phrasing; لا صلة قرابة ("no kinship link") also works. |

## Depth: `great-` and `removed`

**Great- lines.** Arabic has no regular prefix. Options, most traditional first:

1. **Chain the genitive.** Grandfather's father = أبو الجد; father's grandfather = جد الأب; grandfather's grandfather = جد الجد (this is up=4, the form the ticket mentions). Correct and traditional but **path-specific**: one phrase per branch. Unlimited depth would need the full chain of parents' sexes, not just `side`.
2. **Legal shorthand.** Inheritance law says الجد وإن علا ("the grandfather, however high") and وإن سفل ("however low"). General for any depth, but a legal phrase, not a label. (K)
3. **Degree phrase (calque).** جد من الدرجة الثالثة, or جد أعلى ("higher grandfather") for anything beyond a grandparent. Understandable, not idiomatic. UNSURE.

**Recommendation to put to the owner:** use real words as far as one is natural (grandparent, perhaps أبو الجد / أم الجد for great-grandparents), then switch to option 3 for deeper lines, with the actual chain in the detail panel.

**"Removed" cousins.** No word; see the Degree table.

## Open questions for the owner

1. **Widen the descriptor, or accept less precise Arabic?** It lacks the uncle's/sibling's gender, the half-sibling's shared parent, the grandchild's intermediate child and the ancestor chain. Without them Arabic can only give generic words for cousins, nephews/nieces and half-siblings.
2. **Neutral forms.** There is no singular neutral for sibling, grandparent, uncle/aunt, step-parent or most in-laws. Choose between slash forms (أخ/أخت), the fallback قريب/قريبة, or "ولد ..." for children of uncles/siblings.
3. **Half-sibling wording** when the shared parent is unknown: أخ غير شقيق?
4. **Ended partnership:** طليق/طليقة (implies divorce) or زوج سابق (neutral about how it ended)?
5. **Uncle's partner:** literal (زوجة العم) or the everyday عمة/خالة that the English label mirrors?
6. **In-laws:** descriptive forms (safe, longer) or single words حمو/حماة/صهر/كنة (short, but حمو is ambiguous and صهر broad)?
7. **Second and removed cousins:** accept "Relative + path", or adopt the calque ابن عم من الدرجة الثانية?
8. **Great-grandparents and deeper:** chained forms (needs the chain) or the degree calque (جد أعلى)?
9. **Same-sex partners of a child:** صهر vs كنة encode the child's sex.
10. A **native review** before shipping; rows marked (K) have no citation.

## Sources

All accessed 2026-10-17.

- Al Jazeera Learning Arabic, "الأقارب وأفراد الأسرة في اللغة العربية": https://learning.aljazeera.net/ar/node/934 (parents, grandparents, grandchildren, عم/خال, أخ لأب, زوج الأم/زوجة الأب, ربيب, الحمو/الختن/الكنة/الحماة/العديل). Fetched.
- Arabic Goals, "Mastering Arabic Family Vocabulary: Extended Relations and Cultural Nuances": https://arabicgoals.com/?p=1731 (cousins, nephews/nieces, حفيد, حم / حماة). Fetched.
- Kalimah Center, "Family Members In Arabic": https://kalimah-center.com/family-members-in-arabic/ (search result only; contains an apparent labelling error).
- Terminology Encyclopedia, entry on الحفيد: https://terminologyenc.com/es/browse/term/8694 (حفيد as "child's child"; one school uses it for son's and daughter's child). Search result only.
- Dar al-Ifta (Egypt), fatwa on a daughter's son's inheritance: https://www.dar-alifta.org/ar/Fatwa/Details/15562/ (context only). Search result only.
- Lane's Lexicon, entry سبط: https://www.laneslexicon.com/word/سبط/n18726 (tribe/division; applied to Husayn in a hadith). Search result only; the "daughter's son" sense is not confirmed.
- Pointers only: Rekhta on "sihr" (https://rekhtadictionary.com/meaning-of-sihr), kamus.nahwu.id on نسيب, ConceptNet on سلف (https://conceptnet.io/c/ar/سلف).
- Failed fetches (404): Wikipedia and Wiktionary kinship pages.

Everything marked (K) is from my own knowledge of Arabic, uncited. In particular: لأم half-siblings, ابن عمة / ابن خالة, شقيق/شقيقة, طليق/طليقة, ولد as neutral, and every great-/removed construction.
