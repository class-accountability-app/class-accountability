import Link from 'next/link'

// Persistent shell nav: wordmark left, sign-out right when signed in.
// Lives once in the root layout — no page reimplements it.
export function Nav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-10">
        <Link
          href="/"
          className="font-heading text-lg font-semibold tracking-tight text-ink sm:text-xl"
        >
          Study Pods
        </Link>
        {signedIn && (
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="nav-link font-meta text-xs text-muted"
            >
              sign out
            </button>
          </form>
        )}
      </div>
    </header>
  )
}
