'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { TEAM_LINKS_MAX, TEAM_LINK_TITLE_MAX, TEAM_LINK_URL_MAX, linkHost } from '@/lib/team-links'
import { FieldError, FormError, describedField } from '@/components/form-errors'
import { secondaryButtonClass } from '@/components/buttons'
import { addTeamLink, removeTeamLink } from '@/app/classes/[classId]/project/team-link-actions'

export type TeamLink = { id: string; title: string; url: string }

const FIELD_FOR_ERROR: Partial<Record<ErrorKey, 'title' | 'url'>> = {
  linkTitleRequired: 'title',
  linkTitleTooLong: 'title',
  linkUrlRequired: 'url',
  linkUrlInvalid: 'url',
}

// チームのリンク (0043), on the board: what the whole team shares in one place
// (the assignment brief, the final deck, a shared folder), since each task now
// has its own file. Links open in a new tab; any member adds or removes. The
// add form is folded away so the card stays short.
export function TeamLinks({ classId, projectId, links }: { classId: string; projectId: string; links: TeamLink[] }) {
  const t = useTranslations('teamLinks')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<ErrorKey | null>(null)
  const [removeError, setRemoveError] = useState<ErrorKey | null>(null)
  const [isPending, startTransition] = useTransition()
  const full = links.length >= TEAM_LINKS_MAX
  const errorField = error ? FIELD_FOR_ERROR[error] : undefined
  const fieldError = (field: 'title' | 'url') => (errorField === field ? error : null)

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await addTeamLink(classId, projectId, { title, url })
      if (result.error) {
        setError(result.error)
        const field = FIELD_FOR_ERROR[result.error]
        if (field) formRef.current?.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus()
        return
      }
      setTitle('')
      setUrl('')
      router.refresh()
    })
  }

  function remove(linkId: string) {
    setRemoveError(null)
    startTransition(async () => {
      const result = await removeTeamLink(classId, linkId)
      if (result.error) setRemoveError(result.error)
      router.refresh()
    })
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="rule-card flex flex-col px-5 py-5">
      <p className="font-meta text-xs leading-7 font-bold tracking-[0.04em] text-accent-text">{t('kicker')}</p>
      <h2 id={`${id}-heading`} className="font-heading text-[17px] leading-7 font-bold text-ink">
        {t('title')}
      </h2>
      {links.length === 0 ? (
        <p className="text-[13px] leading-7 text-muted">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col pt-1">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-2 border-b border-dashed border-ink/15 py-1.5 last:border-b-0">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg hover:bg-surface-container"
              >
                <span className="text-[15px] leading-6 font-semibold text-ink underline underline-offset-4 [overflow-wrap:anywhere]">
                  {link.title}
                  <span className="sr-only">{t('opensNewTab')}</span>
                </span>
                <span className="font-meta text-xs leading-5 text-muted [overflow-wrap:anywhere]">{linkHost(link.url)}</span>
              </a>
              <button
                type="button"
                disabled={isPending}
                onClick={() => remove(link.id)}
                aria-label={t('removeLabel', { title: link.title })}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink hover:bg-surface-container disabled:opacity-50"
              >
                <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <FormError error={removeError} />

      {full ? (
        <p className="pt-2 text-[13px] leading-7 text-muted">{t('full', { max: TEAM_LINKS_MAX })}</p>
      ) : (
        <details className="pt-2">
          <summary className={`${secondaryButtonClass} w-full cursor-pointer`}>＋ {t('add')}</summary>
          <form ref={formRef} onSubmit={add} noValidate className="flex flex-col gap-3.5 pt-3.5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-title`} className="text-sm font-semibold text-ink">
                {t('nameLabel')}
              </label>
              <input
                id={`${id}-title`}
                name="title"
                type="text"
                value={title}
                maxLength={TEAM_LINK_TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('namePlaceholder')}
                className="h-12 w-full rounded-lg border border-outline bg-surface px-3.5 text-base text-ink placeholder:text-muted"
                {...describedField(fieldError('title'), `${id}-title-error`)}
              />
              <FieldError id={`${id}-title-error`} error={fieldError('title')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-url`} className="text-sm font-semibold text-ink">
                {t('urlLabel')}
              </label>
              <input
                id={`${id}-url`}
                name="url"
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={url}
                maxLength={TEAM_LINK_URL_MAX}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
                className="h-12 w-full rounded-lg border border-outline bg-surface px-3.5 text-base text-ink placeholder:text-muted"
                {...describedField(fieldError('url'), `${id}-url-error`, `${id}-url-hint`)}
              />
              <p id={`${id}-url-hint`} className="text-[13px] leading-6 text-muted">
                {t('urlHint')}
              </p>
              <FieldError id={`${id}-url-error`} error={fieldError('url')} />
            </div>
            <button type="submit" disabled={isPending} className={`${secondaryButtonClass} w-full`}>
              {isPending ? tCommon('working') : t('submit')}
            </button>
            <FormError error={errorField ? null : error} />
          </form>
        </details>
      )}
      <p className="pt-2 text-[13px] leading-6 text-muted">{t('who')}</p>
    </section>
  )
}
