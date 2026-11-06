import { ClassBar } from './class-bar'

// Every page of a class gets the class bar (back to the list, switch class).
// No <ViewTransition> here: template.tsx below animates the pages (CLAUDE.md).
export default async function ClassLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ classId: string }>
}) {
  const { classId } = await params
  return (
    <>
      <ClassBar classId={classId} />
      {children}
    </>
  )
}
