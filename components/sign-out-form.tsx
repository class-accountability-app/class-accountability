'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { releaseThisDevice } from '@/components/push'
import { clearAll, hasAnyDraft } from '@/lib/local-draft'
import { ChoiceDialog } from '@/components/choice-dialog'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'

// Log out (設定 and the header). Before the form goes to /auth/signout, this
// browser's push subscription is dropped and its endpoint sent along, so the
// route deletes the row while the student is still signed in: a shared phone
// never gets the previous student's nudges. Without JavaScript it is a plain
// form and still signs out.
//
// Unsaved writing (Prompt 12): if the editor left a draft in this browser
// (text not yet on the server), this asks first, then deletes every draft so
// the next person on this device can't open them. /login wipes them too, for
// the no-JavaScript path.
export function SignOutForm({
  className,
  buttonClassName,
  children,
}: {
  className?: string
  buttonClassName: string
  children: ReactNode
}) {
  const t = useTranslations('signOut')
  const formRef = useRef<HTMLFormElement>(null)
  const endpointRef = useRef<HTMLInputElement>(null)
  const releasing = useRef(false)
  const [warning, setWarning] = useState(false)

  async function signOut() {
    if (releasing.current) return
    releasing.current = true
    await clearAll({ seal: true })
    const endpoint = await releaseThisDevice()
    if (endpointRef.current) endpointRef.current.value = endpoint ?? ''
    formRef.current?.submit()
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (releasing.current) return
    if (await hasAnyDraft()) {
      setWarning(true)
      return
    }
    await signOut()
  }

  return (
    <form ref={formRef} action="/auth/signout" method="post" className={className} onSubmit={handleSubmit}>
      <input ref={endpointRef} type="hidden" name="push_endpoint" defaultValue="" />
      <button type="submit" className={buttonClassName}>
        {children}
      </button>
      <ChoiceDialog open={warning} labelledBy="sign-out-warning-title" onCancel={() => setWarning(false)}>
        <div className="flex flex-col gap-3 text-left">
          <h2 id="sign-out-warning-title" className="font-heading text-lg leading-7 font-bold">
            {t('unsavedTitle')}
          </h2>
          <p className="text-[15px] leading-7 font-normal">{t('unsavedBody')}</p>
          <div className="flex flex-col gap-2.5 pt-1">
            {/* Staying is the safe choice, so it is the filled button and
                takes focus first. */}
            <button type="button" autoFocus onClick={() => setWarning(false)} className={primaryButtonClass}>
              {t('cancel')}
            </button>
            <button type="button" onClick={signOut} className={secondaryButtonClass}>
              {t('confirm')}
            </button>
          </div>
        </div>
      </ChoiceDialog>
    </form>
  )
}
