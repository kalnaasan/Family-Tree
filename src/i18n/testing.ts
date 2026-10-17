import { type MessageRef, renderMessage } from './messageRef.ts'
import { DICTIONARIES } from './messages.ts'
import { createTranslator } from './translate.ts'

const english = createTranslator('en', DICTIONARIES)

/** The English words of a message, so a test about pure code can say what the user would read. */
export const renderEnglish = (ref: MessageRef): string => renderMessage(english, ref)
