import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GooglePocClient } from './google-poc-client'

export default async function GooglePocPage() {
  if (process.env.NODE_ENV === 'production') {
    redirect('/')
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-4 py-12 sm:items-start sm:pl-16">
      <div className="flex w-full max-w-md flex-col gap-2">
        <h1 className="font-heading text-xl font-semibold text-ink">Google Docs POC</h1>
        <p className="font-meta text-xs text-muted">
          Dev-only spike — not part of the app&apos;s scope.
        </p>
      </div>
      <GooglePocClient />
    </div>
  )
}
