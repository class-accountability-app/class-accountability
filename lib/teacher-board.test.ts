import { describe, expect, it } from 'vitest'
import { otherProjects, otherTeams, projectIdAt, type TeamProjectRow } from './teacher-board'

const row = (team: number, id: string, cp: string | null): TeamProjectRow => ({
  team_no: team,
  team_name: null,
  project_id: id,
  project_title: id,
  class_project_id: cp,
  deadline: null,
})
const rows = [row(2, 'b-talk', 'talk'), row(1, 'a-talk', 'talk'), row(1, 'a-report', 'report'), row(1, 'a-own', null), row(2, 'b-report', 'report')]

describe('teacher board links', () => {
  it('lists every team doing the same class project, by team number', () => {
    expect(otherTeams(rows, rows[0]).map((r) => r.project_id)).toEqual(['a-talk', 'b-talk'])
  })
  it("a team's own project has no counterpart", () => {
    expect(otherTeams(rows, rows[3]).map((r) => r.project_id)).toEqual(['a-own'])
  })
  it("lists the same team's projects in the given order", () => {
    expect(otherProjects(rows, rows[1]).map((r) => r.project_id)).toEqual(['a-talk', 'a-report', 'a-own'])
  })
  it("finds the n-th project of a team, or null", () => {
    expect(projectIdAt(rows, 1, 1)).toBe('a-report')
    expect(projectIdAt(rows, 2, 1)).toBe('b-report')
    expect(projectIdAt(rows, 3, 0)).toBeNull()
  })
})
