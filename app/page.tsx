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
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Hey {profile?.display_name ?? 'there'}
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">{user.email}</p>
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/classes"
          className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Go to classes
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded border border-black/[.15] px-4 py-2 text-sm font-medium dark:border-white/[.2]"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
