import Link from 'next/link'

// ポッドの進み具合を見る (Prompt 11b): a whole card that links to a class's
// progress page, on Home under each pod and on the class page under あなたの
// ポッド. Two 28px lines tall (56px), so it stays on the notebook rule and
// the whole card is the tap target.
export function PodProgressLink({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link
      href={href}
      className="rule-card flex min-h-14 items-center justify-between gap-3 px-3.5 text-ink hover:bg-[#fffdf7]"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] leading-7 font-semibold">{title}</span>
        <span className="text-xs leading-7 text-muted">{sub}</span>
      </span>
      <svg
        aria-hidden
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-accent-text"
      >
        <path d="M8 4.5L13.5 10 8 15.5" />
      </svg>
    </Link>
  )
}
