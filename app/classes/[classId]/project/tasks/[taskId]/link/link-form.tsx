'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import type { TaskMetric } from '@/lib/tasks'
import { FormError } from '@/components/form-errors'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'
import { pickGoogleFile } from '@/components/google-picker'
import { googleDocHeadings, googlePickerToken, linkTaskSource, unlinkTaskSource } from '../../../google-actions'

type Choice = 'section' | 'doc' | 'slides' | 'words' | 'sheet' | 'manual'
type SourceKind = 'doc' | 'doc_section' | 'slides' | 'doc_words' | 'sheet'
type Current = { kind: SourceKind; fileId: string; headingId: string | null; state: string } | null

// The link kind each picked-file choice saves (0040 adds words and sheet), and
// the kind it was saved as back to the choice.
const KIND_OF: Record<'doc' | 'slides' | 'words' | 'sheet', SourceKind> = {
  doc: 'doc',
  slides: 'slides',
  words: 'doc_words',
  sheet: 'sheet',
}
const CHOICE_OF: Record<SourceKind, Choice> = { doc: 'doc', doc_section: 'section', slides: 'slides', doc_words: 'words', sheet: 'sheet' }

// The mockup's four options as native radios (one tap, keyboard for free).
// A section needs a heading chosen from the group Doc; a Doc or Slides file is
// chosen in Google's picker, which is also what lets the app read it.
export function LinkForm({
  classId,
  taskId,
  title,
  metric,
  groupDocId,
  current,
  locale,
  pathLabel = false,
}: {
  classId: string
  taskId: string
  title: string
  metric: TaskMetric
  groupDocId: string | null
  current: Current
  locale: string
  pathLabel?: boolean
}) {
  const t = useTranslations('google')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const id = useId()
  const options: Choice[] =
    metric === 'count'
      ? ['slides', 'words', 'sheet', 'manual']
      : [...(groupDocId ? (['section'] as const) : []), 'doc', 'manual']
  const initial: Choice = current ? CHOICE_OF[current.kind] : options[0]
  const [choice, setChoice] = useState<Choice>(options.includes(initial) ? initial : options[0])
  const [headings, setHeadings] = useState<{ id: string; text: string }[] | null>(null)
  const [heading, setHeading] = useState<string>(current?.kind === 'doc_section' ? (current.headingId ?? '') : '')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)

  // The group Doc's headings, read with my own token when I choose "section".
  useEffect(() => {
    if (choice !== 'section' || !groupDocId || headings) return
    let live = true
    googleDocHeadings(groupDocId).then((result) => {
      if (!live) return
      if (result.error) setError(result.error)
      else {
        setHeadings(result.headings ?? [])
        if (!heading && result.headings?.[0]) setHeading(result.headings[0].id)
      }
    })
    return () => {
      live = false
    }
  }, [choice, groupDocId, headings, heading])

  function done() {
    router.push(`/classes/${classId}/project`)
    router.refresh()
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      if (choice === 'manual') {
        const result = current ? await unlinkTaskSource(classId, taskId) : { error: null }
        return result.error ? setError(result.error) : done()
      }
      if (choice === 'section') {
        if (!groupDocId || !heading) return setError('googleHeadingRequired')
        const result = await linkTaskSource(classId, taskId, { kind: 'doc_section', fileId: groupDocId, headingId: heading, label: title })
        return result.error ? setError(result.error) : done()
      }
      // A Doc, Slides or Sheets file: Google's picker in this browser.
      const token = await googlePickerToken()
      if (token.error || !token.token) return setError(token.error ?? 'googleFailed')
      let file: { id: string; name: string } | null = null
      try {
        file = await pickGoogleFile(choice === 'slides' ? 'slides' : choice === 'sheet' ? 'sheet' : 'doc', token.token, locale)
      } catch {
        return setError('googleFailed')
      }
      if (!file) return
      const result = await linkTaskSource(classId, taskId, { kind: KIND_OF[choice], fileId: file.id, label: file.name || title })
      return result.error ? setError(result.error) : done()
    })
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby={`${id}-title`} className="rule-card flex flex-col gap-5 px-5 py-5">
      <div>
        {pathLabel && <p className="font-meta text-xs leading-7 font-bold tracking-[0.04em] text-accent-text">{t('pathExisting')}</p>}
        <h2 id={`${id}-title`} className="font-heading text-[17px] leading-7 font-bold text-ink">
          {t(current ? 'changeExistingTitle' : 'linkExistingTitle')}
        </h2>
        <p className="text-[13px] leading-7 text-muted">{t('linkExistingWhy')}</p>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">{t('linkLegend')}</legend>
        {options.map((option) => (
          <label
            key={option}
            className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl px-4 py-3 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ink ${
              choice === option ? 'bg-tint-penna' : 'bg-surface shadow-[inset_0_0_0_1px_var(--border)] hover:bg-surface-container'
            }`}
          >
            <input
              type="radio"
              name="choice"
              value={option}
              checked={choice === option}
              onChange={() => {
                setChoice(option)
                setError(null)
              }}
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--ink)]"
            />
            <span className="flex flex-col">
              <span className="text-[15px] leading-6 font-semibold text-ink">{t(`options.${option}.title`)}</span>
              <span className="text-[13px] leading-6 text-ink">{t(`options.${option}.hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {choice === 'section' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-heading`} className="text-sm font-semibold text-ink">
            {t('headingLabel')}
          </label>
          <select
            id={`${id}-heading`}
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            disabled={!headings}
            className="h-12 w-full rounded-lg border border-outline bg-surface px-3.5 text-base text-ink disabled:opacity-60"
          >
            {!headings && <option value="">{tCommon('working')}</option>}
            {headings?.map((h) => (
              <option key={h.id} value={h.id}>
                {h.text || '—'}
              </option>
            ))}
          </select>
          <p className="text-[13px] leading-[1.7] text-muted">{t('headingHint')}</p>
        </div>
      )}

      <button type="submit" disabled={isPending} className={`${primaryButtonClass} w-full`}>
        {isPending
          ? tCommon('working')
          : choice === 'section' || choice === 'manual'
            ? t('save')
            : t(current ? 'pickAndChange' : 'pickAndLink')}
      </button>
      {current && choice !== 'manual' && (
        <p className="text-[13px] leading-7 text-muted">{t('relinkNote')}</p>
      )}
      <FormError error={error} />
      <button type="button" onClick={() => router.back()} className={`${secondaryButtonClass} w-full`}>
        {tCommon('cancel')}
      </button>
    </form>
  )
}
