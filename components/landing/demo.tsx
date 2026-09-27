import type { CSSProperties } from 'react'
import { getTranslations } from 'next-intl/server'

// The hero demo (screens Main/Mobile): five 3.5s scenes in one 17.5s CSS loop.
// No JavaScript. It is decoration for sighted users; screen readers get the
// figcaption, which says what the demo shows. Under reduced motion nothing
// animates and scene 4 (whose static styles are visible) stays on screen.

const LOOP = 17.5
const SCENE = 3.5

// Negative delays start every scene at its own point of the cycle at once.
// (A positive delay with fill-mode both shows each keyframe's 0% state until
// it starts: on the first loop every dot would be dark at the same time.)
function loop(name: string, scene: number): CSSProperties {
  const delay = scene === 0 ? 0 : scene * SCENE - LOOP
  return { animation: `${name} ${LOOP}s ease ${delay}s infinite both` }
}

// Scene 4 is the still frame: visible without animation.
const STILL = 3

function Scene({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-0 flex flex-col gap-3 px-5 py-5 sm:px-7 sm:py-6"
      style={{ opacity: index === STILL ? 1 : 0, ...loop('lp-scene', index) }}
    >
      {children}
    </div>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="font-meta text-xs text-muted">{children}</div>
}

function Cursor({ scene }: { scene: number }) {
  return (
    <svg
      width="20"
      height="24"
      viewBox="0 0 20 24"
      className="absolute -right-2 -bottom-4 z-[3]"
      style={{ opacity: 0, ...loop('lp-cursor', scene) }}
    >
      <path
        d="M2 2 L2 19 L7 14.5 L10.5 22 L13.5 20.6 L10 13.2 L16.5 13.2 Z"
        fill="#3a2f22"
        stroke="#fbf6ea"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Stamp({ stale = false, style }: { stale?: boolean; style?: CSSProperties }) {
  const color = stale ? '#948e78' : '#54714c'
  return (
    <span
      className="mt-px inline-flex size-[22px] shrink-0 -rotate-[7deg] items-center justify-center rounded-full border-[1.5px]"
      style={{ borderColor: color, ...style }}
    >
      <span className="size-[7px] rounded-full" style={{ background: color }} />
    </span>
  )
}

function Bar({ width, style }: { width: string; style?: CSSProperties }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-[2px] bg-border">
      <div className="h-full origin-left bg-ink" style={{ width, ...style }} />
    </div>
  )
}

const button =
  'inline-flex h-[34px] shrink-0 items-center rounded-[2px] bg-accent px-3.5 text-[13px] font-semibold text-white shadow-[0_2px_0_rgba(58,47,34,0.35)]'
const field =
  'flex h-[34px] items-center rounded-[2px] border border-border bg-[#f3e9d6] px-3 text-[15px]'

export async function Demo() {
  const t = await getTranslations('landing.demo')
  const captions = [t('caption1'), t('caption2'), t('caption3'), t('caption4'), t('caption5')]

  return (
    <figure className="relative z-[1] m-0" style={{ animation: 'lp-rise 0.8s ease 0.3s both' }}>
      <figcaption className="sr-only">{t('description')}</figcaption>
      {/* Tape and paper clip, as in the design. */}
      <div
        aria-hidden
        className="absolute -top-3.5 left-1/2 z-[2] -ml-[66px] h-7 w-[132px] -rotate-3 bg-[rgba(201,164,104,0.5)] bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.18)_0,rgba(255,255,255,0.18)_6px,transparent_6px,transparent_12px)]"
      />
      <svg
        aria-hidden
        width="24"
        height="60"
        viewBox="0 0 26 66"
        fill="none"
        stroke="#8a8272"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="absolute -top-[22px] right-10 z-[2]"
      >
        <path d="M8 54 V16 a5 5 0 0 1 10 0 V52 a8 8 0 0 1 -16 0 V20" />
      </svg>

      <div aria-hidden className="overflow-hidden rounded-[2px] border border-border bg-surface shadow-[0_10px_24px_-18px_rgba(58,47,34,0.45)]">
        <div className="flex h-[38px] items-center gap-1.5 border-b border-border bg-[#f5ecda] px-3.5">
          <span className="size-[9px] rounded-full border border-[#b9a57c]" />
          <span className="size-[9px] rounded-full border border-[#b9a57c]" />
          <span className="size-[9px] rounded-full border border-[#b9a57c]" />
          <span className="mr-10 grow text-center font-meta text-xs text-muted">{t('host')}</span>
        </div>

        <div className="relative h-[400px] text-ink sm:h-[420px]">
          {/* 1. The class invitation (screen 04). */}
          <Scene index={0}>
            <Eyebrow>{t('inviteEyebrow')}</Eyebrow>
            <div className="flex flex-col gap-3 rounded-[2px] border border-border bg-surface p-4">
              <div>
                <div className="font-heading text-xl font-bold">{t('className')}</div>
                <div className="mt-0.5 font-meta text-xs text-muted">{t('classMeta')}</div>
              </div>
              <div className="relative grid">
                <span
                  className={`${button} col-start-1 row-start-1 h-11 justify-center text-sm`}
                  style={loop('lp-btn-out', 0)}
                >
                  {t('joinButton')}
                </span>
                <span
                  className="col-start-1 row-start-1 self-center justify-self-center rounded-[3px] border-2 border-[#54714c] px-2.5 py-0.5 font-meta text-sm font-bold text-[#54714c]"
                  style={{ opacity: 0, ...loop('lp-joined', 0) }}
                >
                  {t('joined')}
                </span>
                <Cursor scene={0} />
              </div>
            </div>
          </Scene>

          {/* 2. Forming a pod. */}
          <Scene index={1}>
            <Eyebrow>{t('podHeading')}</Eyebrow>
            <div className="rounded-[2px] border border-border bg-surface px-3.5 py-3">
              {[
                [t('you'), 'lp-ap1'],
                [t('sato'), 'lp-ap2'],
                [t('tanaka'), 'lp-ap3'],
              ].map(([name, anim]) => (
                <div
                  key={anim}
                  className="flex items-center gap-2.5 border-b border-dashed border-[#e3d4b0] py-2"
                  style={{ opacity: 0, ...loop(anim, 1) }}
                >
                  <Stamp />
                  <span className="grow text-[15px] font-semibold">{name}</span>
                  <span className="font-meta text-[11px] text-muted">{t('memberJoined')}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className={`${field} h-9 grow justify-between`}>
                <span>{t('tanaka')}</span>
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="#3a2f22" strokeWidth="1.5">
                  <path d="M1 1l4 4 4-4" />
                </svg>
              </div>
              <div className="relative">
                <span className={button}>{t('invite')}</span>
                <Cursor scene={1} />
              </div>
            </div>
          </Scene>

          {/* 3. A target from a template. */}
          <Scene index={2}>
            <Eyebrow>{t('targetHeading')}</Eyebrow>
            <div className="flex flex-wrap gap-2">
              <span
                className="relative inline-flex h-8 items-center rounded-2xl border border-border bg-surface px-3 text-[13px]"
                style={loop('lp-chip', 2)}
              >
                {t('chipReport2000')}
                <Cursor scene={2} />
              </span>
              {[t('chipReport4000'), t('chipStudy10'), t('chipCustom')].map((chip) => (
                <span key={chip} className="inline-flex h-8 items-center rounded-2xl border border-border bg-surface px-3 text-[13px]">
                  {chip}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-meta text-[11px] text-muted">{t('titleLabel')}</span>
              <div className={field}>
                <span style={{ opacity: 0, ...loop('lp-ap3', 2) }}>{t('titleValue')}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                [t('amountLabel'), t('amountValue')],
                [t('dueLabel'), t('dueValue')],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1">
                  <span className="font-meta text-[11px] text-muted">{label}</span>
                  <div className={field}>
                    <span style={{ opacity: 0, ...loop('lp-ap3', 2) }}>{value}</span>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <span className={button}>{t('createTarget')}</span>
            </div>
          </Scene>

          {/* 4. Progress moves (the still frame). */}
          <Scene index={3}>
            <Eyebrow>{t('progressHeading')}</Eyebrow>
            <div className="rounded-[2px] border border-border bg-surface px-3.5 py-1">
              <div className="flex gap-2.5 border-b border-dashed border-[#e3d4b0] py-2.5">
                <Stamp style={loop('lp-stamp-late', 3)} />
                <div className="grow">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[15px] font-semibold">{t('youReport')}</span>
                    <span className="font-meta text-[11px] text-muted">{t('today')}</span>
                  </div>
                  <Bar width="62%" style={loop('lp-grow', 3)} />
                  <div className="mt-1 font-meta text-[11px] text-muted">
                    <span className="inline-grid">
                      <span className="col-start-1 row-start-1" style={{ opacity: 0, ...loop('lp-out', 3) }}>
                        {t('amount700')}
                      </span>
                      <span className="col-start-1 row-start-1" style={loop('lp-in', 3)}>
                        {t('amount1240')}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              {[
                [t('sato'), t('today'), '80%', t('amount1600'), false],
                [t('tanaka'), t('daysAgo'), '10%', t('amount200'), true],
              ].map(([name, when, width, amount, stale]) => (
                <div key={String(name)} className="flex gap-2.5 border-b border-dashed border-[#e3d4b0] py-2.5 last:border-b-0">
                  <Stamp stale={Boolean(stale)} />
                  <div className="grow">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[15px] font-semibold">{name}</span>
                      <span className="font-meta text-[11px] text-muted">{when}</span>
                    </div>
                    <Bar width={String(width)} />
                    <div className="mt-1 font-meta text-[11px] text-muted">{amount}</div>
                  </div>
                </div>
              ))}
            </div>
          </Scene>

          {/* 5. A nudge. */}
          <Scene index={4}>
            <Eyebrow>{t('podHeadingShort')}</Eyebrow>
            <div className="rounded-[2px] border border-border bg-surface px-3.5 py-1">
              <div className="flex gap-2.5 border-b border-dashed border-[#e3d4b0] py-2.5">
                <Stamp />
                <div className="grow">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[15px] font-semibold">{t('you')}</span>
                    <span className="font-meta text-[11px] text-muted">{t('today')}</span>
                  </div>
                  <Bar width="62%" />
                  <div className="mt-1 font-meta text-[11px] text-muted">{t('amount1240')}</div>
                </div>
              </div>
              <div className="flex gap-2.5 py-2.5">
                <Stamp stale />
                <div className="grow">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[15px] font-semibold">{t('tanaka')}</span>
                    <span className="relative text-xs font-semibold text-accent-text underline underline-offset-[3px]">
                      {t('nudge')}
                      <Cursor scene={4} />
                    </span>
                  </div>
                  <Bar width="10%" />
                  <div className="mt-1 font-meta text-[11px] text-muted">{t('amount200')}</div>
                </div>
              </div>
            </div>
            <div
              className="rounded-[2px] border border-border bg-[#f3e9d6] px-3.5 py-3"
              style={{ opacity: 0, ...loop('lp-note-late', 4) }}
            >
              <div className="font-meta text-[11px] text-muted">{t('nudgeEyebrow')}</div>
              <div className="mt-1 text-[15px] leading-[1.6]">
                <span className="font-semibold text-accent-text">{t('you')}</span> {t('nudgeTo')}
              </div>
            </div>
          </Scene>
        </div>

        {/* Scene captions and progress dots. */}
        <div className="relative h-[70px] border-t border-dashed border-border bg-surface sm:h-[60px]">
          {captions.map((caption, i) => (
            <p
              key={caption}
              className="absolute inset-y-0 right-[90px] left-5 m-0 flex items-center font-heading text-base leading-[1.35] font-bold text-ink sm:left-7 sm:text-lg"
              style={{ opacity: i === STILL ? 1 : 0, ...loop('lp-scene', i) }}
            >
              {caption}
            </p>
          ))}
          <div className="absolute inset-y-0 right-5 flex items-center gap-[7px] sm:right-7">
            {captions.map((caption, i) => (
              <span
                key={caption}
                className="size-2 rounded-full"
                style={{ background: i === STILL ? '#3a2f22' : '#d9c69a', ...loop('lp-dot', i) }}
              />
            ))}
          </div>
        </div>
      </div>
    </figure>
  )
}
