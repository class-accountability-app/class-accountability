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

type Choice = 'section' | 'doc' | 'slides' | 'manual'
type Current = { kind: 'doc' | 'doc_section' | 'slides'; fileId: string; headingId: string | null; state: string } | null

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
}: {
  classId: string
  taskId: string
  title: string
  metric: TaskMetric
  groupDocId: string | null
  current: Current
  locale: string
}) {
  const t = useTranslations('google')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const id = useId()
  const options: Choice[] =
    metric === 'count' ? ['slides', 'manual'] : [...(groupDocId ? (['section'] as const) : []), 'doc', 'manual']
  const initial: Choice =
    current?.kind === 'doc_section' ? 'section' : current?.kind === 'doc' ? 'doc' : current?.kind === 'slides' ? 'slides' : options[0]
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
      // A Doc or Slides file: Google's picker in this browser.
      const token = await googlePickerToken()
      if (token.error || !token.token) return setError(token.error ?? 'googleFailed')
      let file: { id: string; name: string } | null = null
      try {
        file = await pickGoogleFile(choice === 'slides' ? 'slides' : 'doc', token.token, locale)
      } catch {
        return setError('googleFailed')
      }
      if (!file) return
      const result = await linkTaskSource(classId, taskId, { kind: choice, fileId: file.id, label: file.name || title })
      return result.error ? setError(result.error) : done()
    })
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {current?.state === 'lost_access' && <p className="text-sm leading-7 text-accent-text">{t('lostExplain')}</p>}
      <fieldset className="flex flex-col gap-3.5">
        <legend className="sr-only">{t('linkLegend')}</legend>
        {options.map((option) => (
          <label
            key={option}
            className={`flex cursor-pointer gap-3 rounded-[2px] bg-[#fffdf7] p-3.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
              choice === option ? 'shadow-[inset_0_0_0_2px_var(--color-ink)]' : 'shadow-[inset_0_0_0_1px_#b9a57c]'
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
              className="mt-1.5 h-5 w-5 shrink-0 accent-[var(--color-ink)]"
            />
            <span className="flex flex-col">
              <span className="text-[15px] leading-7 font-semibold text-ink">{t(`options.${option}.title`)}</span>
              <span className="text-[13px] leading-7 text-muted">{t(`options.${option}.hint`)}</span>
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
            className="h-12 w-full rounded-[2px] border border-[#b9a57c] bg-[#fffdf7] px-3.5 text-base text-ink disabled:opacity-60"
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

      <button type="submit" disabled={isPending} className={`${primaryButtonClass} h-[52px] w-full`}>
        {isPending ? tCommon('working') : choice === 'doc' || choice === 'slides' ? t('pickAndLink') : t('save')}
      </button>
      {current && choice !== 'manual' && (
        <p className="text-[13px] leading-7 text-muted">{t('relinkNote')}</p>
      )}
      <FormError error={error} />
      <button type="button" onClick={() => router.back()} className={`${secondaryButtonClass} self-start`}>
        {tCommon('cancel')}
      </button>
    </form>
  )
}
