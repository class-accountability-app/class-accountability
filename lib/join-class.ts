import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toErrorKey, type ActionResult } from '@/lib/errors'
import { afterJoinHref } from '@/lib/first-run'
import { readFirstRunFacts } from '@/lib/first-run-facts'

// Join the class a code belongs to, then go on: to the pod step if this is the
// student's very first class (lib/first-run.ts), else to the class page as
// before. join_class_by_code (0013) is the only way into a class; "already a
// member" is a success. The facts are read BEFORE joining. On success this
// redirects, so only a failure comes back.
export async function joinClassAndGo(
  supabase: SupabaseClient,
  userId: string,
  code: string
): Promise<ActionResult> {
  const facts = await readFirstRunFacts(supabase, userId)

  const { data: classId, error } = await supabase.rpc('join_class_by_code', { code })
  if (error) {
    return { error: toErrorKey('joinClassByCode', error) }
  }
  if (!classId) {
    return { error: 'joinCodeInvalid' }
  }

  revalidatePath('/', 'layout')
  redirect(afterJoinHref(facts, classId as string))
}
