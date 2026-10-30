import { describe, expect, it } from 'vitest'
import { inviteFirst, lineShareUrl } from './team-invite'

describe('team invite', () => {
  it('puts the invite first for teams of 1 or 2', () => {
    expect(inviteFirst(1)).toBe(true)
    expect(inviteFirst(2)).toBe(true)
    expect(inviteFirst(3)).toBe(false)
  })

  it('builds a LINE share link with the whole text encoded', () => {
    expect(lineShareUrl('ゼミのチーム https://study-pods.org/team/ABCD2345?x=1&y=2')).toBe(
      'https://line.me/R/share?text=%E3%82%BC%E3%83%9F%E3%81%AE%E3%83%81%E3%83%BC%E3%83%A0%20https%3A%2F%2Fstudy-pods.org%2Fteam%2FABCD2345%3Fx%3D1%26y%3D2'
    )
  })
})
