import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { PRIVACY_POLICY_PATH } from '@/lib/contact'
import { Demo } from './demo'

// The public landing page at / for logged-out visitors, from
// docs/mockups/phase1/16-landing-desktop.dc.html (1440) and
// 16-landing-mobile.dc.html (390). One responsive page: phone first, the
// desktop grid from lg up. Header, <main> and footer come from the root
// layout. All motion is CSS; under reduced motion none of it runs (see
// .landing in globals.css).

function rise(delay: number, duration = 0.7): CSSProperties {
  return { animation: `lp-rise ${duration}s ease ${delay}s both` }
}

function draw(duration: number, delay: number, easing = 'ease'): CSSProperties {
  return { animation: `lp-draw ${duration}s ${easing} ${delay}s forwards` }
}

const body = 'text-[#4a3d2c]'
const card = 'rounded-[2px] border border-border bg-surface'
const section = 'mx-auto w-full max-w-[1440px] border-t border-border px-5 py-12 lg:px-[120px] lg:py-24'
const primaryCta =
  'btn inline-flex h-[52px] items-center justify-center rounded-[2px] bg-accent px-7 text-base font-semibold whitespace-nowrap text-white'

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 font-meta text-[13px] tracking-[0.04em] text-muted lg:text-sm" style={rise(0.1, 0.6)}>
      {children}
    </p>
  )
}

function SectionHeading({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="font-heading text-[26px] leading-[1.45] font-bold lg:text-4xl lg:leading-[1.4]" style={rise(0.2, 0.6)}>
      {children}
    </h2>
  )
}

function StepNumber({ n }: { n: string }) {
  return (
    <span className="inline-flex size-[42px] -rotate-[8deg] items-center justify-center rounded-full border-[1.5px] border-accent-text font-meta text-[15px] text-accent-text">
      {n}
    </span>
  )
}

function ComingSoon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block -rotate-3 rounded-[2px] border border-accent-text px-2.5 py-1 font-meta text-xs text-accent-text">
      {children}
    </span>
  )
}

export async function Landing({ accountDeleted = false }: { accountDeleted?: boolean }) {
  const [t, locale] = await Promise.all([getTranslations('landing'), getLocale()])

  return (
    <div className="landing flex flex-col overflow-x-clip text-ink">
      {/* After 設定 → アカウントを削除 (lib/contact ACCOUNT_DELETED_PATH). */}
      {accountDeleted && (
        <div className="mx-auto w-full max-w-[1440px] px-5 pt-6 lg:px-[120px]">
          <p
            role="status"
            className="rounded-[2px] border border-accent-text bg-surface px-4 py-3 text-[15px] font-semibold text-ink"
          >
            {t('accountDeleted')}
          </p>
        </div>
      )}
      {/* Hero */}
      <section
        aria-labelledby="landing-title"
        className="relative mx-auto grid w-full max-w-[1440px] grid-cols-[minmax(0,1fr)] gap-10 px-5 pt-12 pb-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-[72px] lg:px-[120px] lg:pt-[104px] lg:pb-28"
      >
        <svg aria-hidden width="190" height="190" viewBox="0 0 190 190" fill="none" className="absolute top-[30px] right-9 hidden lg:block">
          <circle cx="95" cy="95" r="74" stroke="rgba(150,105,55,0.18)" strokeWidth="8" />
          <circle cx="98" cy="92" r="67" stroke="rgba(150,105,55,0.10)" strokeWidth="3" />
        </svg>
        <div>
          <p className="mb-4 font-meta text-[13px] tracking-[0.04em] text-muted lg:mb-5 lg:text-sm" style={rise(0.1)}>
            {t('hero.eyebrow')}
          </p>
          <h1 id="landing-title" className="font-heading text-[31px] leading-[1.5] font-bold lg:text-[50px] lg:leading-[1.45]" style={rise(0.2)}>
            {t('hero.titleLine1')}
            <br />
            {t('hero.titleLine2')}
            {/* Japanese breaks before the last line; English flows on, as in the design. */}
            {locale === 'ja' ? <br /> : ' '}
            <span className="relative inline-block">
              {t('hero.titleLine3')}
              <svg aria-hidden viewBox="0 0 300 16" preserveAspectRatio="none" className="absolute -bottom-1 left-0 h-3.5 w-full overflow-visible">
                <path
                  className="lp-draw"
                  d="M3 10 C 60 3, 120 14, 180 7 S 270 5, 297 9"
                  fill="none"
                  stroke="#b5583f"
                  strokeWidth="3"
                  strokeLinecap="round"
                  pathLength={1}
                  style={draw(0.9, 0.9)}
                />
              </svg>
            </span>
          </h1>
          <p className={`mt-6 max-w-[560px] text-base leading-[1.9] lg:mt-7 lg:text-lg ${body}`} style={rise(0.35)}>
            {t('hero.body')}
          </p>
          <div className="mt-7 flex flex-col gap-3 lg:mt-10 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-5 lg:gap-y-3" style={rise(0.5)}>
            <Link href="/login" className={`${primaryCta} w-full lg:w-auto`}>
              {t('hero.cta')}
            </Link>
            <span aria-hidden className="hidden -rotate-[5deg] items-center gap-1 text-lg font-semibold whitespace-nowrap text-muted lg:inline-flex">
              <svg width="40" height="22" viewBox="0 0 40 22" fill="none" stroke="#6b5636" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M38 15 C 28 4, 14 4, 4 12" />
                <path d="M4 12 L 11 5 M4 12 L 12 15" />
              </svg>
              {t('hero.note')}
            </span>
            <a href="#how" className="inline-flex min-h-11 items-center self-center font-semibold whitespace-nowrap text-accent-text underline underline-offset-4 lg:ml-3 lg:self-auto">
              {t('hero.how')}
            </a>
          </div>
          <p className="mt-4 font-meta text-[13px] text-muted lg:mt-5" style={rise(0.6)}>
            {t('hero.ctaHint')}
          </p>
        </div>
        <Demo />
      </section>

      {/* How it works */}
      <section id="how" aria-labelledby="how-heading" className={`${section} scroll-mt-4`}>
        <Eyebrow>{t('steps.eyebrow')}</Eyebrow>
        <SectionHeading id="how-heading">{t('steps.heading')}</SectionHeading>
        <ol className="mt-8 grid gap-4 lg:mt-12 lg:grid-cols-3 lg:gap-6">
          {(
            [
              ['01', t('steps.step1Title'), t('steps.step1Body'), <StepOneArt key="a" />, 0.3],
              ['02', t('steps.step2Title'), t('steps.step2Body'), <StepTwoArt key="b" />, 0.45],
              ['03', t('steps.step3Title'), t('steps.step3Body'), <StepThreeArt key="c" />, 0.6],
            ] as const
          ).map(([n, title, text, art, delay]) => (
            <li key={n} className={`${card} flex flex-col gap-3.5 p-6 lg:p-8`} style={rise(delay)}>
              <div className="flex h-14 items-center justify-between">
                <StepNumber n={n} />
                {art}
              </div>
              <h3 className="font-heading text-xl font-bold lg:text-[22px]">{title}</h3>
              <p className={`text-base leading-[1.85] ${body}`}>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* What the pod sees */}
      <section aria-labelledby="features-heading" className={section}>
        <Eyebrow>{t('features.eyebrow')}</Eyebrow>
        <SectionHeading id="features-heading">{t('features.heading')}</SectionHeading>
        <p className={`mt-4 text-base leading-[1.85] lg:text-lg ${body}`} style={rise(0.3, 0.6)}>
          {t('features.body')}
        </p>
        <div className="mt-8 grid gap-4 lg:mt-12 lg:grid-cols-2 lg:gap-6">
          <Feature title={t('features.barTitle')} text={t('features.barBody')} delay={0.3}>
            <div className="flex h-16 flex-col justify-center gap-2.5">
              {[
                ['72%', '0s'],
                ['40%', '0.8s'],
              ].map(([w, d]) => (
                <div key={d} className="h-2 overflow-hidden rounded-[2px] bg-border">
                  <div
                    className="h-full origin-left bg-ink"
                    style={{ width: w, animation: `lp-loopbar 3.2s ease-in-out ${d} infinite alternate` }}
                  />
                </div>
              ))}
            </div>
          </Feature>
          <Feature title={t('features.recentTitle')} text={t('features.recentBody')} delay={0.45}>
            <div className="flex h-16 items-center gap-7">
              <span className="flex items-center gap-2.5">
                <span
                  className="inline-flex size-7 -rotate-[7deg] items-center justify-center rounded-full border-[1.5px] border-[#54714c]"
                  style={{ animation: 'lp-restamp 4.5s cubic-bezier(.2,1.4,.4,1) 0.5s infinite both' }}
                >
                  <span className="size-[9px] rounded-full bg-[#54714c]" />
                </span>
                <span className={`font-meta text-[13px] ${body}`}>{t('features.activeLabel')}</span>
              </span>
              <span className="flex items-center gap-2.5">
                <span className="inline-flex size-7 -rotate-[7deg] items-center justify-center rounded-full border-[1.5px] border-status-stale">
                  <span className="size-[9px] rounded-full bg-status-stale" />
                </span>
                <span className={`font-meta text-[13px] ${body}`}>{t('features.staleLabel')}</span>
              </span>
            </div>
          </Feature>
          <Feature title={t('features.nudgeTitle')} text={t('features.nudgeBody')} delay={0.6}>
            <div className="flex h-16 items-center">
              <div
                className="rounded-[2px] border border-border bg-[#f3e9d6] px-3.5 py-2.5 text-sm"
                style={{ animation: 'lp-wiggle 3.2s ease-in-out infinite' }}
              >
                {t('features.nudgeSample')}
              </div>
            </div>
          </Feature>
          <Feature title={t('features.docsTitle')} text={t('features.docsBody')} delay={0.75}>
            <div className="flex h-16 items-center gap-4">
              <svg width="44" height="52" viewBox="0 0 44 52" fill="none" stroke="#3a2f22" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 2h26l10 10v38H4z" />
                <path d="M30 2v10h10" />
                {[
                  ['M11 22h22', '0s'],
                  ['M11 29h22', '0.3s'],
                  ['M11 36h14', '0.6s'],
                ].map(([d, delay]) => (
                  <path key={d} className="lp-draw" d={d} pathLength={1} style={{ animation: `lp-lines 3s ease-in-out ${delay} infinite alternate` }} />
                ))}
              </svg>
              <svg width="28" height="14" viewBox="0 0 28 14" fill="none" stroke="#6b5636" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 7h22M18 2l6 5-6 5" />
              </svg>
              <span className="font-meta text-[15px]">{t('features.docsCount')}</span>
              <span className="ml-auto">
                <ComingSoon>{t('features.comingSoon')}</ComingSoon>
              </span>
            </div>
          </Feature>
        </div>
      </section>

      {/* Shared and not shared */}
      <section aria-labelledby="data-heading" className={section}>
        <Eyebrow>{t('data.eyebrow')}</Eyebrow>
        <SectionHeading id="data-heading">{t('data.heading')}</SectionHeading>
        <div className="mt-8 grid gap-4 lg:mt-12 lg:grid-cols-2 lg:gap-6">
          <DataCard
            title={t('data.sharedTitle')}
            stamp={t('data.sharedStamp')}
            stampClass="-rotate-6 border-[#54714c] text-[#54714c]"
            stampAnimation="lp-box-l 0.5s cubic-bezier(.2,1.4,.4,1) 0.9s both"
            items={[t('data.shared1'), t('data.shared2'), t('data.shared3'), t('data.shared4')]}
            delay={0.3}
          />
          <DataCard
            title={t('data.privateTitle')}
            stamp={t('data.privateStamp')}
            stampClass="rotate-[8deg] border-accent-text text-accent-text"
            stampAnimation="lp-box 0.5s cubic-bezier(.2,1.4,.4,1) 1.1s both"
            items={[t('data.private1'), t('data.private2'), t('data.private3')]}
            delay={0.45}
          />
        </div>
        <p className="mt-8">
          <Link href={PRIVACY_POLICY_PATH} className="inline-flex min-h-11 items-center font-semibold text-accent-text underline underline-offset-4">
            {t('data.privacyLink')}
          </Link>
        </p>
      </section>

      {/* For people setting up a class */}
      <section aria-labelledby="class-heading" className={`${section} grid grid-cols-[minmax(0,1fr)] gap-7 lg:grid-cols-2 lg:items-center lg:gap-[72px]`}>
        <div>
          <Eyebrow>{t('classLink.eyebrow')}</Eyebrow>
          <SectionHeading id="class-heading">{t('classLink.heading')}</SectionHeading>
          <p className={`mt-4 text-base leading-[1.85] lg:text-lg ${body}`} style={rise(0.3, 0.6)}>
            {t('classLink.body')}
          </p>
        </div>
        <figure className={`${card} relative m-0 flex flex-col gap-4 p-6 lg:p-8`} style={rise(0.35, 0.6)}>
          <figcaption className="sr-only">{t('classLink.figureLabel')}</figcaption>
          <div aria-hidden className="flex flex-col gap-4">
            <span className="absolute top-[18px] right-5 rounded-[2px] border border-dashed border-[#b9a57c] px-2 py-0.5 font-meta text-[11px] text-muted">
              {t('classLink.example')}
            </span>
            <div className="pr-14 font-heading text-lg font-bold lg:text-xl">{t('classLink.cardTitle')}</div>
            <div className="flex items-stretch gap-2">
              <div className="flex h-11 min-w-0 grow items-center overflow-hidden rounded-[2px] border border-border bg-[#f3e9d6] px-3 font-meta text-sm whitespace-nowrap">
                {t('classLink.link')}
              </div>
              <span className="inline-flex h-11 shrink-0 items-center rounded-[2px] border border-ink bg-surface px-4 text-sm font-semibold shadow-[0_2px_0_rgba(58,47,34,0.25)]">
                {t('classLink.copy')}
              </span>
            </div>
            <div className="flex items-baseline gap-3 font-meta">
              <span className="text-sm text-muted">{t('classLink.codeLabel')}</span>
              <span className="text-xl font-bold tracking-[0.12em]">{t('classLink.code')}</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 lg:gap-[18px]">
              <ExampleQr />
              <div className="flex flex-col items-start gap-3">
                <p className="max-w-[12em] -rotate-3 text-[15px] leading-[1.6] font-semibold text-muted">{t('classLink.qrNote')}</p>
                <span className="inline-flex h-11 items-center rounded-[2px] border border-ink bg-surface px-4 text-sm font-semibold shadow-[0_2px_0_rgba(58,47,34,0.25)]">
                  {t('classLink.present')}
                </span>
              </div>
            </div>
          </div>
        </figure>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-heading" className={`${section} grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:items-start lg:gap-[72px]`}>
        <div>
          <Eyebrow>{t('faq.eyebrow')}</Eyebrow>
          <SectionHeading id="faq-heading">{t('faq.heading')}</SectionHeading>
        </div>
        <div className="lp-faq border-t border-border" style={rise(0.3, 0.6)}>
          {(
            [
              ['freeQ', 'freeA'],
              ['teacherQ', 'teacherA'],
              ['passwordQ', 'passwordA'],
              ['podSizeQ', 'podSizeA'],
              ['docsQ', 'docsA'],
              ['anyClassQ', 'anyClassA'],
            ] as const
          ).map(([q, a], i) => (
            <details key={q} open={i === 0} className="border-b border-border">
              <summary className="flex min-h-[68px] cursor-pointer list-none items-center justify-between gap-4 py-3 font-heading text-lg leading-[1.5] font-bold lg:text-xl">
                {t(`faq.${q}`)}
                <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#9c4830" strokeWidth="1.8" strokeLinecap="round" className="lp-faq-icon shrink-0 transition-transform duration-200">
                  <path d="M9 3v12M3 9h12" />
                </svg>
              </summary>
              <p className={`mb-5 pr-[34px] text-base leading-[1.85] ${body}`}>{t(`faq.${a}`)}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section
        aria-labelledby="closing-heading"
        className="relative mx-5 mb-12 flex flex-col gap-6 rounded-[2px] border border-border bg-surface px-[22px] py-7 lg:mx-auto lg:mb-24 lg:w-[calc(100%-240px)] lg:max-w-[1200px] lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:px-16 lg:py-14"
        style={rise(0.2)}
      >
        <svg aria-hidden width="170" height="80" viewBox="0 0 170 80" fill="none" className="absolute -top-9 right-12 hidden overflow-visible lg:block">
          <path d="M4 74 C 40 78, 58 42, 94 50 S 132 52, 144 28" stroke="#6b5636" strokeWidth="1.5" strokeDasharray="4 6" strokeLinecap="round" />
          <g style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'lp-float 3.2s ease-in-out infinite' }}>
            <path d="M140 24 L168 8 L156 34 L150 26 Z" stroke="#3a2f22" strokeWidth="1.5" strokeLinejoin="round" fill="#fbf6ea" />
            <path d="M150 26 L168 8" stroke="#3a2f22" strokeWidth="1.5" />
          </g>
        </svg>
        <div>
          <h2 id="closing-heading" className="font-heading text-2xl leading-[1.4] font-bold lg:text-[32px]">
            {t('closing.heading')}
          </h2>
          <p className={`mt-3 max-w-[640px] text-base leading-[1.85] ${body}`}>{t('closing.body')}</p>
        </div>
        <Link href="/login" className={`${primaryCta} w-full shrink-0 lg:w-auto`}>
          {t('closing.cta')}
        </Link>
      </section>
    </div>
  )
}

function Feature({ title, text, delay, children }: { title: string; text: string; delay: number; children: ReactNode }) {
  return (
    <div className={`${card} flex flex-col gap-4 p-6 lg:p-8`} style={rise(delay)}>
      <div aria-hidden>{children}</div>
      <h3 className="font-heading text-xl font-bold lg:text-[22px]">{title}</h3>
      <p className={`text-base leading-[1.85] ${body}`}>{text}</p>
    </div>
  )
}

function DataCard({
  title,
  stamp,
  stampClass,
  stampAnimation,
  items,
  delay,
}: {
  title: string
  stamp: string
  stampClass: string
  stampAnimation: string
  items: string[]
  delay: number
}) {
  return (
    <div className={`${card} relative overflow-hidden p-6 lg:p-8`} style={rise(delay)}>
      <span
        aria-hidden
        className={`absolute top-[22px] right-5 rounded-[3px] border-2 px-3 py-1 font-meta text-[15px] font-bold tracking-[0.12em] lg:top-[26px] lg:right-7 ${stampClass}`}
        style={{ animation: stampAnimation }}
      >
        {stamp}
      </span>
      <h3 className="mb-4 pr-[110px] font-heading text-xl font-bold lg:text-[22px]">{title}</h3>
      <ul className={`list-disc pl-[1.2em] text-base leading-[1.85] ${body}`}>
        {items.map((item) => (
          <li key={item} className="mb-2 last:mb-0">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

const stroke = {
  fill: 'none',
  stroke: '#3a2f22',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function StepOneArt() {
  return (
    <svg aria-hidden width="68" height="56" viewBox="0 0 68 56" {...stroke}>
      <rect className="lp-draw" x="14" y="4" width="46" height="48" rx="2" pathLength={1} style={draw(1, 0.6)} />
      <path className="lp-draw" d="M9 14h9M9 26h9M9 38h9" pathLength={1} style={draw(0.6, 1.2)} />
      <path className="lp-draw" d="M25 18h26M25 28h26M25 38h14" pathLength={1} style={draw(0.8, 1.4)} />
      <path className="lp-draw" d="M42 37l4 4 9-10" stroke="#b5583f" strokeWidth="2.2" pathLength={1} style={draw(0.4, 2)} />
    </svg>
  )
}

function StepTwoArt() {
  return (
    <svg aria-hidden width="68" height="56" viewBox="0 0 68 56" {...stroke}>
      <ellipse cx="34" cy="30" rx="31" ry="23" stroke="#9c4830" strokeDasharray="3 4" />
      <circle className="lp-draw" cx="22" cy="24" r="5" pathLength={1} style={draw(0.5, 0.9)} />
      <circle className="lp-draw" cx="34" cy="19" r="5" pathLength={1} style={draw(0.5, 1.1)} />
      <circle className="lp-draw" cx="46" cy="24" r="5" pathLength={1} style={draw(0.5, 1.3)} />
      <path className="lp-draw" d="M14 41 q8 -12 16 0 M26 36 q8 -12 16 0 M38 41 q8 -12 16 0" pathLength={1} style={draw(0.9, 1.5)} />
    </svg>
  )
}

function StepThreeArt() {
  return (
    <svg aria-hidden width="68" height="56" viewBox="0 0 68 56" {...stroke}>
      <path d="M6 44h50" />
      <path className="lp-draw" d="M6 44h32" stroke="#b5583f" strokeWidth="4" pathLength={1} style={draw(1.2, 1.2, 'cubic-bezier(.3,.9,.3,1)')} />
      <path className="lp-draw" d="M58 44V8" pathLength={1} style={draw(0.5, 0.8)} />
      <path className="lp-draw" d="M58 10h-16l5 6-5 6h16" pathLength={1} style={draw(0.6, 1.3)} />
    </svg>
  )
}

// A decorative QR-like tile for the example card: finder squares and a fixed
// pattern, not a real code, so nobody scans it to a class that doesn't exist.
function ExampleQr() {
  const cells: [number, number][] = []
  for (let y = 0; y < 25; y++) {
    for (let x = 0; x < 25; x++) {
      const inFinder = (x < 8 && y < 8) || (x > 16 && y < 8) || (x < 8 && y > 16)
      if (!inFinder && (x * 7 + y * 13 + x * y) % 5 < 2) cells.push([x, y])
    }
  }
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <path d={`M${x} ${y}h7v7h-7z M${x + 1} ${y + 1}v5h5v-5z`} fillRule="evenodd" />
      <path d={`M${x + 2} ${y + 2}h3v3h-3z`} />
    </g>
  )
  return (
    <svg width="150" height="150" viewBox="-2 -2 29 29" className="shrink-0 rounded-[2px] border border-border bg-white" fill="#3a2f22">
      {finder(0, 0)}
      {finder(18, 0)}
      {finder(0, 18)}
      <path d={cells.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('')} />
    </svg>
  )
}
