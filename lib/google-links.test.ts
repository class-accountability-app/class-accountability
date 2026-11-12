import { describe, expect, it } from 'vitest'
import {
  googleErrorReason,
  groupDocRequests,
  taskDocOutline,
  fileNameFor,
  isFileId,
  isHeadingId,
  safeReturnPath,
  sourceFileUrl,
  sourceLabel,
} from './google-links'

type StyleRequest = {
  updateParagraphStyle: { range: { startIndex: number; endIndex: number }; paragraphStyle: { namedStyleType: string } }
}

const classId = '00000000-0000-4000-8000-0000000000c1'
const taskId = '00000000-0000-4000-8000-0000000000a1'

describe('safeReturnPath', () => {
  it('keeps the project board and a link page', () => {
    expect(safeReturnPath(`/classes/${classId}/project`)).toBe(`/classes/${classId}/project`)
    expect(safeReturnPath(`/classes/${classId}/project/tasks/${taskId}/link`)).toBe(
      `/classes/${classId}/project/tasks/${taskId}/link`
    )
  })

  it('sends anything else home', () => {
    for (const raw of [null, '', 'https://evil.example', '//evil.example', `/classes/${classId}/project?x=1`, '/settings']) {
      expect(safeReturnPath(raw)).toBe('/')
    }
  })
})

describe('ids and labels', () => {
  it('accepts Google-shaped ids only', () => {
    expect(isFileId('1DocFileAbCdEfGhIjKlMnOpQrStUvWx')).toBe(true)
    expect(isFileId('../etc/passwd')).toBe(false)
    expect(isFileId('short')).toBe(false)
    expect(isHeadingId('h.abc123')).toBe(true)
    expect(isHeadingId('h abc')).toBe(false)
  })

  it('makes a 1–60 character label without control characters', () => {
    expect(sourceLabel('  台本\n  ')).toBe('台本')
    expect([...sourceLabel('あ'.repeat(70))].length).toBe(60)
    expect(sourceLabel('   ')).toBe('Google')
  })
})

describe('a task\'s own Doc', () => {
  it('outlines the title, then each template section as a heading with an empty line, or one empty line', () => {
    expect(taskDocOutline('レポート', ['はじめに'])).toEqual([
      { text: 'レポート', style: 'TITLE' },
      { text: 'はじめに', style: 'HEADING_1' },
      { text: '', style: 'NORMAL_TEXT' },
    ])
    expect(taskDocOutline('レポート', [])).toEqual([
      { text: 'レポート', style: 'TITLE' },
      { text: '', style: 'NORMAL_TEXT' },
    ])
  })

  it('inserts the text once and styles each heading over its exact range', () => {
    const requests = groupDocRequests(taskDocOutline('台本 — あき', ['Data', '結果'])) as [unknown, ...StyleRequest[]]
    expect(requests[0]).toEqual({ insertText: { location: { index: 1 }, text: '台本 — あき\nData\n\n結果\n\n' } })
    const ranges = (requests.slice(1) as StyleRequest[]).map((r) => [r.updateParagraphStyle.range, r.updateParagraphStyle.paragraphStyle.namedStyleType])
    expect(ranges).toEqual([
      [{ startIndex: 1, endIndex: 9 }, 'TITLE'], // 台本 — あき = 7 + \n
      [{ startIndex: 9, endIndex: 14 }, 'HEADING_1'], // Data = 4 + \n
      [{ startIndex: 15, endIndex: 18 }, 'HEADING_1'], // after the empty line: 結果 = 2 + \n
    ])
  })

  it('counts an emoji as two index units, as Google does', () => {
    const requests = groupDocRequests(taskDocOutline('😀', [])) as [unknown, StyleRequest]
    expect(requests[1].updateParagraphStyle.range).toEqual({ startIndex: 1, endIndex: 4 })
  })
})

describe('googleErrorReason', () => {
  it("reads Google's reason, or its status when there is none", () => {
    const body = { error: { code: 400, message: 'Bad Request', errors: [{ reason: 'invalidSharingRequest' }], status: 'INVALID_ARGUMENT' } }
    expect(googleErrorReason(body)).toBe('invalidSharingRequest')
    expect(googleErrorReason({ error: { code: 403, status: 'PERMISSION_DENIED' } })).toBe('PERMISSION_DENIED')
  })

  it('logs nothing that is not a plain word', () => {
    for (const body of [null, 'oops', {}, { error: {} }, { error: { errors: [{ reason: 'x@andrew.ac.jp' }] } }, { error: { status: 'a b' } }, { error: { status: 'a'.repeat(65) } }]) {
      expect(googleErrorReason(body)).toBeNull()
    }
  })
})

describe('sourceFileUrl', () => {
  it('opens each kind in the right Google app', () => {
    expect(sourceFileUrl('doc', 'abc123def45')).toBe('https://docs.google.com/document/d/abc123def45/edit')
    expect(sourceFileUrl('doc_section', 'abc123def45')).toBe('https://docs.google.com/document/d/abc123def45/edit')
    expect(sourceFileUrl('doc_words', 'abc123def45')).toBe('https://docs.google.com/document/d/abc123def45/edit')
    expect(sourceFileUrl('slides', 'abc123def45')).toBe('https://docs.google.com/presentation/d/abc123def45/edit')
    expect(sourceFileUrl('sheet', 'abc123def45')).toBe('https://docs.google.com/spreadsheets/d/abc123def45/edit')
  })
})

describe('fileNameFor', () => {
  it('adds the owner in the locale\'s brackets', () => {
    expect(fileNameFor('台本', 'あき', false)).toBe('台本（あき）')
    expect(fileNameFor('Script', 'Aki', true)).toBe('Script (Aki)')
  })
  it('is just the title without a name', () => {
    expect(fileNameFor('台本', null, false)).toBe('台本')
    expect(fileNameFor('台本', '  ', false)).toBe('台本')
  })
  it('cuts a long title, never the name, and stays within 60 characters', () => {
    const name = fileNameFor('あ'.repeat(120), 'さとうさん', false)
    expect([...name].length).toBe(60)
    expect(name.endsWith('（さとうさん）')).toBe(true)
  })
})
