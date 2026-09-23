'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { FieldError, FormError, describedField, useFocusFirstInvalid } from '@/components/form-errors'
import { createClass } from './actions'

const FIELDS = ['name', 'university', 'term'] as const
type Field = (typeof FIELDS)[number]

const inputClass =
  'rounded-[2px] border border-border bg-surface px-3 py-3 text-ink placeholder:text-muted'

export function CreateClassForm() {
  const t = useTranslations('classForm')
  const tCommon = useTranslations('common')
  const id = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, ErrorKey>>>({})
  const [formError, setFormError] = useState<ErrorKey | null>(null)
  useFocusFirstInvalid(formRef, fieldErrors)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    const formData = new FormData(e.currentTarget)

    const missing: Partial<Record<Field, ErrorKey>> = {}
    for (const field of FIELDS) {
      if (!formData.get(field)?.toString().trim()) missing[field] = 'required'
    }
    setFieldErrors(missing)
    if (Object.keys(missing).length > 0) return

    startTransition(async () => {
      const { error } = await createClass(formData)
      if (error) {
        setFormError(error)
        return
      }
      formRef.current?.reset()
    })
  }

  function field(name: Field, label: string, placeholder?: string) {
    const inputId = `${id}-${name}`
    const errorId = `${inputId}-error`
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
        </label>
        <input
          id={inputId}
          type="text"
          name={name}
          placeholder={placeholder}
          className={inputClass}
          {...describedField(fieldErrors[name], errorId)}
        />
        <FieldError id={errorId} error={fieldErrors[name]} />
      </div>
    )
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="flex w-full max-w-sm flex-col gap-3"
    >
      {field('name', t('nameLabel'), t('namePlaceholder'))}
      {field('university', t('universityLabel'))}
      {field('term', t('termLabel'), t('termPlaceholder'))}
      <button
        type="submit"
        disabled={isPending}
        className="btn rounded-[2px] bg-accent px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? tCommon('creating') : t('submit')}
      </button>
      <FormError error={formError} />
    </form>
  )
}
