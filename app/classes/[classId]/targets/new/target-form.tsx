'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import {
  FieldError,
  FormError,
  describedField,
  useFocusFirstInvalid,
} from '@/components/form-errors'
import { TARGET_TYPES } from '@/lib/targets'
import {
  TEMPLATE_IDS,
  applyTemplate,
  type TargetDraft,
  type TemplateId,
} from '@/lib/target-templates'
import { createTarget } from '../../progress/actions'

type Field = 'title' | 'target_type' | 'target_amount'
const FIELD_FOR_ERROR: Partial<Record<ErrorKey, Field>> = {
  titleRequired: 'title',
  invalidTargetType: 'target_type',
  targetAmountPositive: 'target_amount',
}

const controlClass =
  'h-12 w-full rounded-[2px] border border-[#b9a57c] bg-[#fffdf7] px-3.5 text-ink placeholder:text-muted'

// Screen 07. The first chip starts selected, as in the mockup; every field
// stays editable. On success it goes back to the class's progress page, or
// for 「Study Pods で書く」 straight to the editor.
export function TargetForm({ classId }: { classId: string }) {
  const t = useTranslations('targetForm')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  const titles = {
    report: t('templateTitles.report'),
    examStudy: t('templateTitles.examStudy'),
    submit: t('templateTitles.submit'),
  }
  const [template, setTemplate] = useState<TemplateId>('report2000')
  const [draft, setDraft] = useState<TargetDraft>(() =>
    applyTemplate('report2000', { title: '', type: 'task', amount: '' }, titles)
  )
  // 記録のしかた (Prompt 12): only for a character count.
  const [inputMode, setInputMode] = useState<'manual' | 'document'>('manual')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  useFocusFirstInvalid(formRef, error)

  const errorField = error ? FIELD_FOR_ERROR[error] : undefined
  const fieldError = (field: Field) => (errorField === field ? error : null)
  const ids = {
    templates: `${id}-templates`,
    title: `${id}-title`,
    type: `${id}-type`,
    amount: `${id}-amount`,
    deadline: `${id}-deadline`,
    inputMode: `${id}-input-mode`,
  }

  function choose(next: TemplateId) {
    setTemplate(next)
    setDraft((current) => applyTemplate(next, current, titles))
    setError(null)
    if (next === 'custom') titleRef.current?.focus()
  }

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
        result.document && result.id
          ? `/classes/${classId}/targets/${result.id}/write`
          : `/classes/${classId}/progress`
      )
    })
  }

  const isStudyHours = draft.type === 'study_hours'

  return (
    <div className="flex w-full flex-col gap-5">
      <section aria-labelledby={ids.templates} className="flex flex-col gap-2.5">
        <h2 id={ids.templates} className="text-[15px] font-semibold text-ink">
          {t('templatesHeading')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_IDS.map((tpl) => (
            <button
              key={tpl}
              type="button"
              aria-pressed={template === tpl}
              onClick={() => choose(tpl)}
              className={`h-11 rounded-full border px-3.5 text-sm ${
                template === tpl
                  ? 'border-ink bg-ink text-surface'
                  : 'border-border bg-surface text-ink'
              }`}
            >
              {t(`templates.${tpl}`)}
            </button>
          ))}
        </div>
        <p className="text-[13px] leading-[1.7] text-muted">{t('templatesHint')}</p>
      </section>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="flex w-full flex-col gap-5"
      >
        <div className="flex flex-col gap-4 rounded-[2px] border border-border bg-surface p-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.title} className="text-sm font-semibold text-ink">
              {t('titleLabel')}
            </label>
            <input
              ref={titleRef}
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

          {/* Native radios drawn as segments: arrow keys and form data for free. */}
          <fieldset
            className="flex flex-col gap-1.5"
            {...describedField(fieldError('target_type'), `${ids.type}-error`)}
          >
            <legend className="mb-1.5 text-sm font-semibold text-ink">{t('typeLabel')}</legend>
            <div className="flex overflow-hidden rounded-[2px] border border-[#b9a57c]">
              {TARGET_TYPES.map((type, i) => (
                <label
                  key={type}
                  className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center px-1.5 py-1.5 text-center text-sm leading-[1.4] has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-4 has-[:focus-visible]:outline-accent ${
                    i > 0 ? 'border-l border-[#b9a57c]' : ''
                  } ${draft.type === type ? 'bg-ink text-surface' : 'bg-[#fffdf7] text-ink'}`}
                >
                  <input
                    type="radio"
                    name="target_type"
                    value={type}
                    checked={draft.type === type}
                    onChange={() => setDraft({ ...draft, type })}
                    className="sr-only"
                  />
                  {t(`typeSegments.${type}`)}
                </label>
              ))}
            </div>
            <FieldError id={`${ids.type}-error`} error={fieldError('target_type')} />
          </fieldset>

          {draft.type !== 'task' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.amount} className="text-sm font-semibold text-ink">
                {t('amountHeading')}
              </label>
              <div className="flex items-center gap-2.5">
                <input
                  id={ids.amount}
                  // Text with a number keyboard, not type="number": a number
                  // field changes its value when a student scrolls the page
                  // with the pointer over it. Same as the ＋記録 sheet; the
                  // server action parses it with parseAmount().
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

          {/* Mockup 07's 記録のしかた, with 「Study Pods で書く」 where the
              mockup had the Google Docs option (phase 3). */}
          {draft.type === 'character_count' && (
            <fieldset className="flex flex-col gap-1.5" aria-describedby={`${ids.inputMode}-hint`}>
              <legend className="mb-1.5 text-sm font-semibold text-ink">{t('inputModeLabel')}</legend>
              <div className="flex overflow-hidden rounded-[2px] border border-[#b9a57c]">
                {(['manual', 'document'] as const).map((mode, i) => (
                  <label
                    key={mode}
                    className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center px-1.5 py-1.5 text-center text-sm leading-[1.4] has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-4 has-[:focus-visible]:outline-accent ${
                      i > 0 ? 'border-l border-[#b9a57c]' : ''
                    } ${inputMode === mode ? 'bg-ink text-surface' : 'bg-[#fffdf7] text-ink'}`}
                  >
                    <input
                      type="radio"
                      name="input_mode"
                      value={mode}
                      checked={inputMode === mode}
                      onChange={() => setInputMode(mode)}
                      className="sr-only"
                    />
                    {t(`inputModes.${mode}`)}
                  </label>
                ))}
              </div>
              <p id={`${ids.inputMode}-hint`} className="text-[13px] leading-[1.7] text-muted">
                {t(`inputModeHint.${inputMode}`)}
              </p>
            </fieldset>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="btn flex h-[52px] w-full items-center justify-center rounded-[2px] bg-accent text-base font-semibold text-white disabled:opacity-50"
        >
          {isPending ? tCommon('creating') : t('submit')}
        </button>
        <FormError error={errorField ? null : error} />
      </form>
    </div>
  )
}
