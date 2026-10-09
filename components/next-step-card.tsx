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

function Plus() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

// 次にやること (Prompt 11b, docs/mockups/phase2/next-step.html): the step
// lib/next-step.ts picked, one sentence of why, and at most one button.
// Primary for a step nothing else on the screen offers; secondary once ＋記録
// is the primary; none at all for "log today", which points at ＋記録 (the
// sticky one on phones, the card's on wider screens) instead of repeating it.
// "Keep writing" (a document target) gets a secondary 続きを書く.
// On the ruled page: 28px lines, 14px padding, the actions row 56px.
export async function NextStepCard({ step }: { step: NextStep }) {
  const [t, tUnits] = await Promise.all([getTranslations('nextStep'), getTranslations('units')])

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
          <CreatePodButton classId={step.classId} buttonClassName={primaryButtonClass} />
          <Link
            href={`/classes/${step.classId}#other-pods`}
            className="-my-2 inline-flex min-h-11 items-center text-sm leading-7 font-semibold text-accent-text underline underline-offset-4"
          >
            {t('pod.other')}
          </Link>
        </>
      )
      break
    case 'firstTarget':
      title = t('firstTarget.title')
      why = t('firstTarget.why', { className: step.className })
      actions = (
        <Link href={`/classes/${step.classId}/targets/new`} className={primaryButtonClass}>
          <Plus />
          {t('firstTarget.action')}
        </Link>
      )
      break
    case 'logToday': {
      title = step.write ? t('logToday.writeTitle') : t('logToday.title')
      const { target, remaining, daysLeft } = step
      const amount =
        remaining !== null && target.type !== 'task' ? tUnits(target.type, { count: remaining }) : null
      const when =
        daysLeft === null
          ? null
          : daysLeft > 0
            ? t('logToday.daysLeft', { count: daysLeft })
            : daysLeft === 0
              ? t('logToday.dueToday')
              : t('logToday.overdue')
      why = amount
        ? when
          ? t('logToday.whyAmountWhen', { title: target.title, amount, when })
          : t('logToday.whyAmount', { title: target.title, amount })
        : when
          ? t('logToday.whyWhen', { title: target.title, when })
          : t('logToday.why', { title: target.title })
      // A document target (Prompt 12): 続きを書く opens its editor. Outlined,
      // since the card's 書く and the sticky 続きを書く are the filled ones.
      actions = step.write ? (
        <Link href={`/classes/${target.classId}/targets/${target.id}/write`} className={secondaryButtonClass}>
          {t('logToday.writeAction')}
          <Chevron />
        </Link>
      ) : (
        <p className="text-[13px] leading-7 text-muted">
          <span className="md:hidden">{t('logToday.hintPhone')}</span>
          <span className="hidden md:inline">{t('logToday.hintWide')}</span>
        </p>
      )
      break
    }
    case 'invite':
      title = t('invite.title')
      why = t('invite.why')
      actions = (
        <Link href={`/classes/${step.classId}#invite`} className={secondaryButtonClass}>
          {t('invite.action')}
          <Chevron />
        </Link>
      )
      break
    case 'seePod':
      title = t('seePod.title')
      why = t('seePod.why')
      actions = (
        <Link href={`/classes/${step.classId}/progress`} className={secondaryButtonClass}>
          {t('seePod.action')}
          <Chevron />
        </Link>
      )
      break
    case 'nextTarget':
      title = t('nextTarget.title')
      why = t('nextTarget.why')
      actions = (
        <Link href={`/classes/${step.classId}/targets/new`} className={primaryButtonClass}>
          <Plus />
          {t('nextTarget.action')}
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
          step.kind === 'join' || (step.kind === 'logToday' && !step.write)
            ? 'min-w-0'
            : 'flex flex-wrap items-center gap-x-4 py-1.5 lg:justify-end'
        }
      >
        {actions}
      </div>
    </section>
  )
}
