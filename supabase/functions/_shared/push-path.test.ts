import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PUSH_PATH, meetingPath, projectPath } from './push-path'

const classId = '00000000-0000-4000-8000-0000000000c1'
const pollId = '00000000-0000-4000-8000-0000000000f1'

describe('PUSH_PATH', () => {
  it('accepts the project board and a meeting', () => {
    expect(PUSH_PATH.test(projectPath(classId))).toBe(true)
    expect(PUSH_PATH.test(meetingPath(classId, pollId))).toBe(true)
  })

  it('refuses anything else', () => {
    for (const path of [
      'https://example.com/',
      '//example.com/classes',
      '/classes/not-a-uuid/project',
      `/classes/${classId}/project/../../settings`,
      `/classes/${classId}/project?x=1`,
      `/classes/${classId}`,
      '/settings/delete-account',
    ]) {
      expect(PUSH_PATH.test(path)).toBe(false)
    }
  })

  it('is the exact pattern the service worker checks', () => {
    const sw = readFileSync('public/sw.js', 'utf8')
    expect(sw).toContain(`const PUSH_PATH = ${PUSH_PATH.toString()}`)
  })
})
