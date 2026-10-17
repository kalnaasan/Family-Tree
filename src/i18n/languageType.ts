/**
 * The languages the app has text for. A module of its own, with nothing else in it, so the pure domain code can say
 * which language it means without importing the store and the browser settings that live in `language.ts`.
 * Which of them users are offered is `AVAILABLE_LANGUAGES` there (spec section 13.1).
 */
export type Language = 'en' | 'ar'
