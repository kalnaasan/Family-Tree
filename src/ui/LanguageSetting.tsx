import { useId } from 'react'
import {
  LANGUAGE_NAMES,
  type LanguageSetting as Setting,
  type LanguageStore,
  useLanguageStore,
} from '../i18n/language.ts'
import { useT } from '../i18n/useT.ts'

/** Settings: the Language (spec section 13.1). Not shown while there is only one language to choose. */
export function LanguageSetting({ store = useLanguageStore }: { store?: LanguageStore }) {
  const id = useId()
  const t = useT(store)
  const available = store((s) => s.available)
  const setting = store((s) => s.setting)
  const setSetting = store((s) => s.setSetting)
  if (available.length < 2) return null
  return (
    <div className="mt-4">
      <label htmlFor={id} className="text-sm font-medium">
        {t('settings.language')}
      </label>
      <select
        id={id}
        value={setting}
        onChange={(event) => setSetting(event.target.value as Setting)}
        className="mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-white px-3"
      >
        <option value="auto">{t('language.auto')}</option>
        {available.map((language) => (
          <option key={language} value={language}>
            {LANGUAGE_NAMES[language]}
          </option>
        ))}
      </select>
    </div>
  )
}
