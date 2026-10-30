import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { NextStep } from '@/lib/next-step'
import { CodeJoinForm } from '@/components/code-join-form'
import { RuleSnap } from '@/components/rule-snap'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'
import { CreatePodButton } from '@/app/classes/[classId]/create-pod-button'

function Chevron() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4.5L13.5 10 8 15.5" />
    </svg>
  )
}


// 次にやること (Prompt 11b, docs/mockups/phase2/next-step.html; project first
// since 2026-10-30): the step lib/next-step.ts picked, one sentence of why,
// and at most one button.
// On the ruled page: 28px lines, 14px padding, the actions row 56px.
//
// `podPrimary` (Home, Prompt 15 PR 2): false draws the pod step's button
// outlined, under a hero target card that owns the filled button.
export async function NextStepCard({ step, podPrimary = true }: { step: NextStep; podPrimary?: boolean }) {
  const t = await getTranslations('nextStep')

  let title: string
  let why: string
  let actions: React.ReactNode = null

  switch (step.kind) {
    case 'join':
      title = t('join.title')
      why = t('join.why')
      actions = (
        <RuleSnap>
          <div className="pt-1.5">
            <CodeJoinForm />
          </div>
        </RuleSnap>
      )
      break
    case 'share':
      title = t('share.title')
      why = t('share.why', { className: step.className })
      actions = (
        <Link href={`/classes/${step.classId}#invite`} className={primaryButtonClass}>
          {t('share.action')}
        </Link>
      )
      break
    case 'invitation':
      title = t('invitation.title')
      why = t('invitation.why', { className: step.className })
      actions = (
        <Link href={`/classes/${step.classId}#invitations`} className={primaryButtonClass}>
          {t('invitation.action')}
        </Link>
      )
      break
    case 'pod':
      title = t('pod.title')
      why = t('pod.why', { className: step.className })
      actions = (
        <>
          <CreatePodButton
            classId={step.classId}
            buttonClassName={podPrimary ? primaryButtonClass : secondaryButtonClass}
          />
          <Link
            href={`/classes/${step.classId}#other-pods`}
            className="-my-2 inline-flex min-h-11 items-center text-sm leading-7 font-semibold text-accent-text underline underline-offset-4"
          >
            {t('pod.other')}
          </Link>
        </>
      )
      break
    case 'invite':
      title = t('invite.title')
      why = t('invite.why')
      actions = (
        <Link href={`/classes/${step.classId}/project`} className={secondaryButtonClass}>
          {t('invite.action')}
          <Chevron />
        </Link>
      )
      break
    case 'startProject':
      title = t('startProject.title')
      why = t('startProject.why', { className: step.className })
      actions = (
        <Link href={`/classes/${step.classId}/project`} className={primaryButtonClass}>
          {t('startProject.action')}
          <Chevron />
        </Link>
      )
      break
    case 'openProject':
      title = t('openProject.title')
      why = t('openProject.why', { className: step.className })
      actions = (
        <Link href={`/classes/${step.classId}/project`} className={primaryButtonClass}>
          {t('openProject.action')}
          <Chevron />
        </Link>
      )
      break
  }

  return (
    <section
      aria-labelledby="next-step-heading"
      className="rule-card grid gap-x-6 py-3.5 pr-3.5 pl-[18px] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
      // Inline, not a utility: .rule-card's own edge (globals.css) is
      // unlayered CSS and would win over a Tailwind shadow class.
      style={{ boxShadow: 'inset 0 0 0 1px var(--border), inset 4px 0 0 var(--accent)' }}
    >
      <div className="min-w-0">
        <p className="font-meta text-xs leading-7 font-bold tracking-[0.04em] text-accent-text">{t('label')}</p>
        <h2 id="next-step-heading" className="font-heading text-[17px] leading-7 font-bold text-ink">
          {title}
        </h2>
        <p className="text-sm leading-7 text-ink">{why}</p>
      </div>
      <div
        className={
          step.kind === 'join'
            ? 'min-w-0'
            : 'flex flex-wrap items-center gap-x-4 py-1.5 lg:justify-end'
        }
      >
        {actions}
      </div>
    </section>
  )
}
