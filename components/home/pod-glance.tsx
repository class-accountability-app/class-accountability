import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { formatTimeAgo, tokyoDaysAgo } from '@/lib/date'
import { needsNudge } from '@/lib/progress-stats'
import type { AmountType } from '@/lib/quick-log'
import { StatusStamp } from '@/components/status-stamp'

// The same 7 days as the class page's stamps (CHURN_THRESHOLD_DAYS there),
// so a podmate's stamp looks the same on both pages.
const STALE_AFTER_DAYS = 7

export type GlanceMate = {
  id: string
  name: string
  lastLoggedAt: string | null
  // This week's total per unit, positive ones only.
  week: { type: AmountType; amount: number }[]
  // I've sent this podmate 3 nudges in the last 24 hours (the 0011 limit).
  nudgeLimitReached: boolean
}

export type GlancePod = {
  classId: string
  className: string
  mates: GlanceMate[]
}

// Home's ポッドの様子 (Prompt 11): each of my pods (one per class), with
// every podmate's name, when they last logged and their 今週 +○. Only what
// RLS already lets podmates see. No ranking and no order by amount: podmates
// keep the order they joined in. A podmate with no log for 3+ days gets a
// quiet 「声かけする」 to the nudge form on the class page. On the ruled page
// every line is 28px: the heading sits on a line, each podmate takes two,
// and the links keep a 44px tap area through negative margins without
// adding height. The dashed separator is a background, not a border.
export async function PodGlance({ pods, now }: { pods: GlancePod[]; now: Date }) {
  const [t, tUnits, locale] = await Promise.all([
    getTranslations('podGlance'),
    getTranslations('units'),
    getLocale() as Promise<Locale>,
  ])

  return (
    <section aria-labelledby="pod-heading" className="flex flex-col gap-7">
      <h2 id="pod-heading" className="-mb-7 px-0.5 font-heading text-[17px] leading-7 font-bold text-ink">
        {t('heading')}
      </h2>
      {pods.length === 0 ? (
        <p className="rule-card px-3.5 py-3.5 text-sm leading-7 text-muted">
          {t('noPod')}{' '}
          <Link href="/classes" className="font-semibold text-accent-text underline underline-offset-4">
            {t('findPod')}
          </Link>
        </p>
      ) : (
        pods.map((pod) => (
          <div key={pod.classId} className="rule-card px-3.5 py-3.5">
            <h3 className="flex font-meta text-xs leading-7 text-muted">
              <Link
                href={`/classes/${pod.classId}/progress`}
                className="-my-2 inline-flex min-h-11 items-center underline-offset-4 hover:underline"
              >
                {pod.className}
              </Link>
            </h3>
            {pod.mates.length === 0 ? (
              <p className="text-sm leading-7 text-muted">
                {t('alone')}{' '}
                <Link href={`/classes/${pod.classId}`} className="font-semibold text-accent-text underline underline-offset-4">
                  {t('invite')}
                </Link>
              </p>
            ) : (
              <ul>
                {pod.mates.map((mate) => {
                  const stale =
                    mate.lastLoggedAt === null || tokyoDaysAgo(mate.lastLoggedAt, now) >= STALE_AFTER_DAYS
                  const nudge = needsNudge(mate.lastLoggedAt, now)
                  return (
                    <li
                      key={mate.id}
                      className="flex items-center gap-2.5 bg-[repeating-linear-gradient(90deg,#e3d4b0_0_4px,transparent_4px_8px)] bg-[length:100%_1px] bg-bottom bg-no-repeat last:bg-none"
                    >
                      <StatusStamp status={stale ? 'stale' : 'active'} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[15px] leading-7 font-semibold text-ink [overflow-wrap:anywhere]">{mate.name}</span>
                        <span className="text-xs leading-7 text-muted">
                          {mate.lastLoggedAt
                            ? t('lastLogged', { when: formatTimeAgo(mate.lastLoggedAt, locale, now) })
                            : t('noLogs')}
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end text-right">
                        {mate.week.length > 0 && (
                          <span className="font-meta text-[13px] leading-7 font-bold text-[#556b40]">
                            {t('week', {
                              amount: mate.week.map((w) => tUnits(w.type, { count: w.amount })).join(t('separator')),
                            })}
                          </span>
                        )}
                        {nudge &&
                          (mate.nudgeLimitReached ? (
                            <span className="max-w-[10em] text-xs leading-7 text-muted">{t('nudgeLimit')}</span>
                          ) : (
                            <Link
                              href={`/classes/${pod.classId}/progress#member-${mate.id}`}
                              className="-my-2 inline-flex min-h-11 items-center text-sm leading-7 font-semibold text-accent-text underline-offset-4 hover:underline"
                            >
                              {t('nudge')}
                              <span className="sr-only">{t('nudgeWho', { name: mate.name })}</span>
                            </Link>
                          ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ))
      )}
    </section>
  )
}
