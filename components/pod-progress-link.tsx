import Link from 'next/link'

// ポッドの進み具合を見る (Prompt 11b): a whole card that links to a class's
// progress page, on Home under each pod and on the class page under あなたの
// ポッド. Two 28px lines tall (56px), so it stays on the notebook rule and
// the whole card is the tap target.
// tone 'attention' (Hudson): something is waiting on me, also said in `sub`.
export function PodProgressLink({ href, title, sub, tone }: { href: string; title: string; sub: string; tone?: 'attention' }) {
  return (
    <Link
      href={href}
      className={`rule-card flex min-h-[72px] items-center justify-between gap-3 px-5 py-3 text-ink ${tone === 'attention' ? 'tint-hudson' : 'hover:bg-surface-container'}`}
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] leading-7 font-semibold">{title}</span>
        <span className={`text-[13px] leading-6 ${tone === 'attention' ? 'font-semibold text-ink' : 'text-muted'}`}>{sub}</span>
      </span>
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-container text-ink">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17L17 7M9 7h8v8" />
        </svg>
      </span>
    </Link>
  )
}
