import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-heading text-2xl font-semibold text-ink sm:text-3xl">
          Hey {profile?.display_name ?? 'there'}
        </h1>
        <p className="font-meta text-sm text-muted">{user.email}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/classes"
          className="rounded-[2px] bg-accent px-5 py-3 text-sm font-medium text-white"
        >
          Go to classes
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-[2px] border border-border bg-surface px-5 py-3 text-sm font-medium text-ink"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
