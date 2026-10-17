import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { createLanguageStore } from '../i18n/language.ts'
import { LanguageSetting } from './LanguageSetting.tsx'

function storeWith(available: ('en' | 'ar')[]) {
  const root = { lang: '', dir: '' }
  const store = createLanguageStore({ available, storage: null, browserLanguages: ['en'], root })
  return { store, root }
}

afterEach(cleanup)

describe('the Language choice in Settings', () => {
  it('is not shown while only one language is available', () => {
    const { store } = storeWith(['en'])
    render(<LanguageSetting store={store} />)
    expect(screen.queryByLabelText('Language')).toBeNull()
  })

  it('offers the browser, English and Arabic (in its own name) once two languages are available', () => {
    const { store } = storeWith(['en', 'ar'])
    render(<LanguageSetting store={store} />)
    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['Same as the browser', 'English', 'العربية'])
  })

  it('switches the language and the page direction as soon as a choice is made', async () => {
    const user = userEvent.setup()
    const { store, root } = storeWith(['en', 'ar'])
    render(<LanguageSetting store={store} />)
    await user.selectOptions(screen.getByLabelText('Language'), 'العربية')
    expect(store.getState().setting).toBe('ar')
    expect(root).toEqual({ lang: 'ar', dir: 'rtl' })
    // the label itself is now in Arabic
    expect(screen.getByLabelText('اللغة')).toBeInTheDocument()
  })
})
