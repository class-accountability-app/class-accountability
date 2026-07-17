import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { JoinButton } from './join-button'
import { CreateClassForm } from './create-class-form'

export default async function ClassesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name, university, term')
    .order('name')

  const { data: memberships } = await supabase
    .from('class_memberships')
    .select('class_id')
    .eq('user_id', user.id)

  const joinedClassIds = new Set(memberships?.map((m) => m.class_id))

  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-4 py-12">
      <div className="flex w-full max-w-xs flex-col gap-3">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Classes</h1>

        {classes && classes.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {classes.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded border border-black/[.15] px-3 py-2 dark:border-white/[.2]"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-black dark:text-zinc-50">
                    {c.name}
                  </span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {c.university} · {c.term}
                  </span>
                </div>
                {joinedClassIds.has(c.id) ? (
                  <Link
                    href={`/classes/${c.id}`}
                    className="text-xs font-medium text-zinc-500 underline dark:text-zinc-400"
                  >
                    View pods
                  </Link>
                ) : (
                  <JoinButton classId={c.id} />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No classes yet.</p>
        )}
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
          Create a class
        </h2>
        <CreateClassForm />
      </div>
    </div>
  )
}
