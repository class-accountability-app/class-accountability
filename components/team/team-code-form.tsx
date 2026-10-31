'use client'

import { useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { normalizeTeamCode } from '@/lib/team-code'
import { FieldError, describedField } from '@/components/form-errors'

// チームコードで参加 (0028): a copy of CodeJoinForm for team codes. It only
// tidies the code and opens /team/{code}, where the joining happens.
export function TeamCodeForm() {
  const t = useTranslations('teamCodeForm')
  const router = useRouter()
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<ErrorKey | null>(null)
  const [isOpening, setIsOpening] = useState(false)

  const inputId = `${id}-code`
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const code = normalizeTeamCode(inputRef.current?.value ?? '')
    if (!code) {
      setError('teamCodeFormat')
      inputRef.current?.focus()
      return
    }
    setError(null)
    setIsOpening(true)
    router.push(`/team/${code}`)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold text-ink">
        {t('label')}
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          name="code"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder={t('placeholder')}
          onChange={() => error && setError(null)}
          className="h-11 w-full min-w-0 rounded-lg border border-[#747775] bg-[#ffffff] px-3.5 font-meta text-ink uppercase placeholder:normal-case placeholder:text-muted"
          {...describedField(error, errorId, hintId)}
        />
        <button
          type="submit"
          disabled={isOpening}
          className="btn h-11 shrink-0 rounded-full border border-ink bg-surface px-4 text-sm font-semibold text-ink disabled:opacity-50"
        >
          {t('submit')}
        </button>
      </div>
      <FieldError id={errorId} error={error} />
      <p id={hintId} className="text-[13px] leading-[1.7] text-muted">
        {t('hint')}
      </p>
    </form>
  )
}
