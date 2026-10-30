'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ErrorKey } from '@/lib/errors'
import { AUTO_SPLIT_SIZES, TEAM_NAME_MAX, groupRoster, splitPreview, type RosterRow, type RosterTeam } from '@/lib/organizer'
import { FormError } from '@/components/form-errors'
import { primaryButtonClass, secondaryButtonClass } from '@/components/buttons'
import { autoSplit, createTeam, moveStudent, renameTeam } from '@/app/classes/[classId]/organizer-actions'

const control = 'h-11 rounded-[2px] border border-[#b9a57c] bg-[#fffdf7] px-2.5 text-base text-ink'

// チームの管理 (0036, item G): the organizer sees every student by name and
// team, makes a team from students without one, splits them automatically,
// renames teams and moves a student (or takes them out of a team). Names and
// teams only: no numbers, tasks or text.
export function TeamManager({ classId, roster }: { classId: string; roster: RosterRow[] }) {
  const t = useTranslations('organizer')
  const tCommon = useTranslations('common')
  const id = useId()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<ErrorKey | null>(null)
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [newName, setNewName] = useState('')
  const [size, setSize] = useState<number>(4)
  const { unassigned, teams } = groupRoster(roster)

  function run(action: () => Promise<{ error: ErrorKey | null }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        setError(result.error)
        return
      }
      after?.()
      router.refresh()
    })
  }

  const teamLabel = (team: RosterTeam) => team.name ?? t('teamNo', { n: team.teamNo })
  const preview = splitPreview(unassigned.length, size)

  return (
    <section aria-labelledby={`${id}-heading`} className="flex w-full max-w-md flex-col gap-4">
      <div>
        <h2 id={`${id}-heading`} className="font-heading text-xl font-bold text-ink">
          {t('heading')}
        </h2>
        <p className="text-[13px] leading-[1.7] text-muted">{t('why', { students: roster.length, teams: teams.length })}</p>
      </div>
      <FormError error={error} />

      <div className="flex flex-col gap-3 rounded-[2px] border border-border bg-surface p-4">
        <h3 className="text-[15px] font-semibold text-ink">{t('unassignedHeading', { count: unassigned.length })}</h3>
        {unassigned.length === 0 ? (
          <p className="text-[13px] text-muted">{t('unassignedNone')}</p>
        ) : (
          <>
            <fieldset className="flex flex-col gap-1">
              <legend className="sr-only">{t('pickLegend')}</legend>
              {unassigned.map((s) => (
                <label key={s.user_id} className="flex min-h-11 items-center gap-2.5 text-[15px] text-ink">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={picked.has(s.user_id)}
                    onChange={(e) =>
                      setPicked((cur) => {
                        const next = new Set(cur)
                        if (e.target.checked) next.add(s.user_id)
                        else next.delete(s.user_id)
                        return next
                      })
                    }
                  />
                  {s.display_name}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-name`} className="text-sm font-semibold text-ink">
                {t('newTeamName')}
              </label>
              <input
                id={`${id}-name`}
                value={newName}
                maxLength={TEAM_NAME_MAX}
                onChange={(e) => setNewName(e.target.value)}
                className={control}
              />
            </div>
            <button
              type="button"
              disabled={isPending || picked.size === 0}
              className={`${primaryButtonClass} self-start`}
              onClick={() =>
                run(
                  () => createTeam(classId, newName, [...picked]),
                  () => {
                    setPicked(new Set())
                    setNewName('')
                  }
                )
              }
            >
              {isPending ? tCommon('working') : t('makeTeam', { count: picked.size })}
            </button>

            <div className="mt-2 flex flex-col gap-1.5 border-t border-dashed border-[#e3d4b0] pt-3">
              <label htmlFor={`${id}-size`} className="text-sm font-semibold text-ink">
                {t('autoSplitLabel')}
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                <select id={`${id}-size`} value={size} onChange={(e) => setSize(Number(e.target.value))} className={control}>
                  {AUTO_SPLIT_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {t('sizeOption', { count: n })}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isPending}
                  className={secondaryButtonClass}
                  onClick={() => run(() => autoSplit(classId, size))}
                >
                  {t('autoSplit')}
                </button>
              </div>
              <p className="text-[13px] text-muted">{t('autoSplitPreview', { teams: preview.length, sizes: preview.join('・') })}</p>
            </div>
          </>
        )}
      </div>

      {teams.map((team) => (
        <TeamCard
          key={team.podId}
          team={team}
          label={teamLabel(team)}
          teams={teams}
          teamLabel={teamLabel}
          pending={isPending}
          onRename={(name) => run(() => renameTeam(classId, team.podId, name))}
          onMove={(userId, to) => run(() => moveStudent(classId, userId, to))}
        />
      ))}
    </section>
  )
}

function TeamCard({
  team,
  label,
  teams,
  teamLabel,
  pending,
  onRename,
  onMove,
}: {
  team: RosterTeam
  label: string
  teams: RosterTeam[]
  teamLabel: (t: RosterTeam) => string
  pending: boolean
  onRename: (name: string) => void
  onMove: (userId: string, to: string | null) => void
}) {
  const t = useTranslations('organizer')
  const id = useId()
  const [name, setName] = useState(team.name ?? '')

  return (
    <div className="flex flex-col gap-2.5 rounded-[2px] border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-ink [overflow-wrap:anywhere]">{label}</h3>
        <span className="font-meta text-xs text-muted">{t('memberCount', { count: team.members.length })}</span>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={`${id}-rename`} className="text-xs text-muted">
            {t('teamName')}
          </label>
          <input
            id={`${id}-rename`}
            value={name}
            maxLength={TEAM_NAME_MAX}
            placeholder={t('teamNo', { n: team.teamNo })}
            onChange={(e) => setName(e.target.value)}
            className={`${control} w-full`}
          />
        </div>
        <button
          type="button"
          disabled={pending || name.trim() === (team.name ?? '')}
          onClick={() => onRename(name)}
          className={secondaryButtonClass}
        >
          {t('save')}
        </button>
      </div>
      <ul className="flex flex-col">
        {team.members.map((m) => (
          <li key={m.user_id} className="flex min-h-11 items-center justify-between gap-2 border-t border-dashed border-[#e3d4b0] py-1">
            <span className="text-[15px] text-ink [overflow-wrap:anywhere]">{m.display_name}</span>
            <label className="sr-only" htmlFor={`${id}-${m.user_id}`}>
              {t('moveLabel', { name: m.display_name })}
            </label>
            <select
              id={`${id}-${m.user_id}`}
              value={team.podId}
              disabled={pending}
              onChange={(e) => onMove(m.user_id, e.target.value === '' ? null : e.target.value)}
              className={`${control} max-w-[11rem]`}
            >
              {teams.map((other) => (
                <option key={other.podId} value={other.podId} disabled={other.podId !== team.podId && other.members.length >= 6}>
                  {other.podId === team.podId ? t('stayIn', { team: teamLabel(other) }) : t('moveTo', { team: teamLabel(other) })}
                </option>
              ))}
              <option value="">{t('removeFromTeam')}</option>
            </select>
          </li>
        ))}
      </ul>
    </div>
  )
}
