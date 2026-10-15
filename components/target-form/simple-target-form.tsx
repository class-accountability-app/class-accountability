'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FieldError, FormError, describedField, useFocusFirstInvalid } from '@/components/form-errors'
import { TARGET_TYPES, type TargetType } from '@/lib/targets'
import {
  PRESET_IDS,
  applyPreset,
  presetFor,
  withType,
  type InputMode,
  type PresetDraft,
} from '@/lib/target-presets'
import { createTarget } from '@/app/classes/[classId]/progress/actions'

type Field = 'title' | 'target_type' | 'target_amount'
const FIELD_FOR_ERROR: Partial<Record<ErrorKey, Field>> = {
  titleRequired: 'title',
  invalidTargetType: 'target_type',
  targetAmountPositive: 'target_amount',
}

const controlClass =
  'h-12 w-full rounded-[2px] border border-[#b9a57c] bg-[#fffdf7] px-3.5 text-ink placeholder:text-muted'

const segmentClass = (selected: boolean, first: boolean) =>
  `flex min-h-11 flex-1 cursor-pointer items-center justify-center px-1.5 py-1.5 text-center text-sm leading-[1.4] has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-4 has-[:focus-visible]:outline-accent ${
    first ? '' : 'border-l border-[#b9a57c]'
  } ${selected ? 'bg-ink text-surface' : 'bg-[#fffdf7] text-ink'}`

// The simplified new-target form (Prompt 15): four starting points, then a
// title, an amount and an optional deadline. The type and how to log it sit
// behind その他の設定. First used by the first-run flow's step 3; /targets/new
// moves onto it in PR 4. `doneHref` is where to go after creating a target
// that is logged by hand; a target written in Study Pods opens its editor.
export function SimpleTargetForm({ classId, doneHref }: { classId: string; doneHref: string }) {
  const t = useTranslations('targetForm')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)

  const titles = {
    report: t('templateTitles.report'),
    examStudy: t('templateTitles.examStudy'),
    submit: t('templateTitles.submit'),
  }
  const [draft, setDraft] = useState<PresetDraft>(() =>
    applyPreset('report', { title: '', type: 'character_count', mode: 'manual', amount: '' }, titles)
  )
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  useFocusFirstInvalid(formRef, error)

  const errorField = error ? FIELD_FOR_ERROR[error] : undefined
  const fieldError = (field: Field) => (errorField === field ? error : null)
  const ids = {
    title: `${id}-title`,
    amount: `${id}-amount`,
    deadline: `${id}-deadline`,
    mode: `${id}-mode`,
  }
  const activePreset = presetFor(draft.type, draft.mode)
  const isStudyHours = draft.type === 'study_hours'

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    if (!formData.get('title')?.toString().trim()) {
      setError('titleRequired')
      return
    }

    startTransition(async () => {
      const result = await createTarget(classId, formData)
      if (result.error) {
        setError(result.error)
        return
      }
      router.push(
        result.document && result.id ? `/classes/${classId}/targets/${result.id}/write` : doneHref
      )
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-7">
      {/* The type and mode the preset or その他の設定 chose. The radios below
          only drive this state; their own values (preset, type_choice,
          mode_choice) are ignored by createTarget. */}
      <input type="hidden" name="target_type" value={draft.type} />
      <input type="hidden" name="input_mode" value={draft.mode} />

      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t('presetsLegend')}</legend>
        {PRESET_IDS.map((preset) => (
          <label
            key={preset}
            className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
              activePreset === preset
                ? 'border-ink bg-ink text-surface'
                : 'border-border bg-surface text-ink'
            }`}
          >
            <input
              type="radio"
              name="preset"
              checked={activePreset === preset}
              onChange={() => {
                setDraft((current) => applyPreset(preset, current, titles))
                setError(null)
              }}
              className="sr-only"
            />
            {t(`presets.${preset}`)}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.title} className="text-sm font-semibold text-ink">
            {t('titleLabel')}
          </label>
          <input
            id={ids.title}
            type="text"
            name="title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder={t('titlePlaceholder')}
            className={controlClass}
            {...describedField(fieldError('title'), `${ids.title}-error`)}
          />
          <FieldError id={`${ids.title}-error`} error={fieldError('title')} />
        </div>

        {draft.type !== 'task' && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.amount} className="text-sm font-semibold text-ink">
              {t(`amountLabel.${draft.type}`)}
            </label>
            <div className="flex items-center gap-2.5">
              {/* Text with a number keyboard, not type="number" (a number
                  field changes when the page is scrolled over it); the server
                  parses it with parseAmount(). */}
              <input
                id={ids.amount}
                type="text"
                name="target_amount"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                inputMode={isStudyHours ? 'decimal' : 'numeric'}
                autoComplete="off"
                placeholder={t(`amountPlaceholder.${draft.type}`)}
                className={controlClass}
                {...describedField(fieldError('target_amount'), `${ids.amount}-error`)}
              />
              <span className="shrink-0 text-[15px] text-ink">{t(`unitSuffix.${draft.type}`)}</span>
            </div>
            <FieldError id={`${ids.amount}-error`} error={fieldError('target_amount')} />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.deadline} className="text-sm font-semibold text-ink">
            {t('deadlineLabel')}
          </label>
          <input id={ids.deadline} type="date" name="deadline" className={controlClass} />
        </div>

        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-accent-text [&::-webkit-details-marker]:hidden">
            {t('moreOptions')}
            <svg
              aria-hidden
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 group-open:rotate-180"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </summary>
          <div className="flex flex-col gap-4 pt-2 pb-1">
            <fieldset
              className="flex flex-col gap-1.5"
              {...describedField(fieldError('target_type'), `${id}-type-error`)}
            >
              <legend className="mb-1.5 text-sm font-semibold text-ink">{t('typeLabel')}</legend>
              <div className="flex overflow-hidden rounded-[2px] border border-[#b9a57c]">
                {TARGET_TYPES.map((type: TargetType, i) => (
                  <label key={type} className={segmentClass(draft.type === type, i === 0)}>
                    <input
                      type="radio"
                      name="type_choice"
                      checked={draft.type === type}
                      onChange={() => setDraft((current) => withType(current, type))}
                      className="sr-only"
                    />
                    {t(`typeSegments.${type}`)}
                  </label>
                ))}
              </div>
              <FieldError id={`${id}-type-error`} error={fieldError('target_type')} />
            </fieldset>

            {draft.type === 'character_count' && (
              <fieldset className="flex flex-col gap-1.5" aria-describedby={`${ids.mode}-hint`}>
                <legend className="mb-1.5 text-sm font-semibold text-ink">{t('inputModeLabel')}</legend>
                <div className="flex overflow-hidden rounded-[2px] border border-[#b9a57c]">
                  {(['manual', 'document'] as InputMode[]).map((mode, i) => (
                    <label key={mode} className={segmentClass(draft.mode === mode, i === 0)}>
                      <input
                        type="radio"
                        name="mode_choice"
                        checked={draft.mode === mode}
                        onChange={() => setDraft({ ...draft, mode })}
                        className="sr-only"
                      />
                      {t(`inputModes.${mode}`)}
                    </label>
                  ))}
                </div>
                <p id={`${ids.mode}-hint`} className="text-[13px] leading-[1.7] text-muted">
                  {t(`inputModeHint.${draft.mode}`)}
                </p>
              </fieldset>
            )}
          </div>
        </details>
      </div>

      <div className="flex flex-col gap-3.5">
        <button
          type="submit"
          disabled={isPending}
          className="btn flex h-[52px] w-full items-center justify-center rounded-[2px] bg-accent text-base font-semibold text-white disabled:opacity-50"
        >
          {isPending ? tCommon('creating') : t('submit')}
        </button>
        <FormError error={errorField ? null : error} />
      </div>
    </form>
  )
}
