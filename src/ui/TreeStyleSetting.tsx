import { useId } from 'react'
import type { MessageKey } from '../i18n/messages.ts'
import { useT } from '../i18n/useT.ts'
import { type TreeShape, useTreeShape } from '../view/treeShape.ts'

const CHOICES: { shape: TreeShape; label: MessageKey }[] = [
  { shape: 'rows', label: 'settings.treeStyle.rows' },
  { shape: 'crown', label: 'settings.treeStyle.crown' },
]

/** Settings: how the Tree is drawn, the chart or the artistic tree. A device setting, kept in this browser. */
export function TreeStyleSetting() {
  const t = useT()
  const name = useId()
  const shape = useTreeShape((s) => s.shape)
  const setShape = useTreeShape((s) => s.setShape)
  return (
    <fieldset>
      <legend className="text-sm font-medium">{t('settings.treeStyle')}</legend>
      <div className="mt-1 flex flex-col gap-2">
        {CHOICES.map((choice) => (
          <label
            key={choice.shape}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line-strong px-4 has-[:checked]:border-leaf-deep has-[:checked]:bg-accent-soft"
          >
            <input type="radio" name={name} value={choice.shape} checked={shape === choice.shape} onChange={() => setShape(choice.shape)} className="size-5 accent-leaf-deep" />
            {t(choice.label)}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
