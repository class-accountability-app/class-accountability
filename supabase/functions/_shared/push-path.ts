// Where tapping a push takes the student. The payload may carry a path, but
// only one of these app pages: the service worker (public/sw.js) accepts a
// path only if it matches PUSH_PATH (a class page for the organizer, 0038; the
// project board; a meeting page) and opens 声かけ (/nudges) otherwise, so a
// push can never send anyone off the app or to an unexpected page.
// push-path.test.ts checks that sw.js uses this exact pattern.

export const PUSH_PATH =
  /^\/classes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/project(\/meetings\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?)?$/

export function projectPath(classId: string): string {
  return `/classes/${classId}/project`
}

export function meetingPath(classId: string, pollId: string): string {
  return `/classes/${classId}/project/meetings/${pollId}`
}

// The organizer's class page (0038: the team-inactive alert).
export function classPath(classId: string): string {
  return `/classes/${classId}`
}
