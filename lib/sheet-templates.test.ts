import { describe, expect, it } from 'vitest'
import { SHEET_TEMPLATES, SHEET_TEMPLATE_KEYS, parseSheetTemplate, sheetCreateBody, sheetTemplateColumns } from './sheet-templates'
import { countSheetRows } from '@/supabase/functions/_shared/google-count'

describe('sheet templates', () => {
  it('has the same columns count in both languages, none empty', () => {
    for (const key of SHEET_TEMPLATE_KEYS) {
      const { ja, en } = SHEET_TEMPLATES[key]
      expect(ja.length).toBe(en.length)
      for (const c of [...ja, ...en]) expect(c.trim()).not.toBe('')
    }
  })

  it('parses only known keys and picks the locale', () => {
    expect(parseSheetTemplate('survey')).toBe('survey')
    expect(parseSheetTemplate('report')).toBeNull()
    expect(sheetTemplateColumns('references', 'en')[0]).toBe('Author')
    expect(sheetTemplateColumns('references', 'ja')[0]).toBe('著者')
  })

  it('writes the header as the first row, bold and frozen, so a new sheet counts 0', () => {
    const body = sheetCreateBody('アンケート', ['日付', '回答'])
    expect(body.properties.title).toBe('アンケート')
    expect(body.sheets[0].properties.gridProperties.frozenRowCount).toBe(1)
    const row = body.sheets[0].data[0].rowData[0].values
    expect(row.map((v) => v.userEnteredValue.stringValue)).toEqual(['日付', '回答'])
    expect(countSheetRows({ values: [row.map((v) => v.userEnteredValue.stringValue)] })).toBe(0)
  })
})
