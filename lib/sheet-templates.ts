// Google Sheets templates (2026-11-08): the header row of a counted task's own
// spreadsheet, in the app's two languages. A sheet task counts the first tab's
// filled rows less the header (0040, _shared/google-count.ts), so a new sheet
// made from a template starts at 0 and every row the team adds counts.

export const SHEET_TEMPLATE_KEYS = ['survey', 'interviews', 'references', 'data'] as const
export type SheetTemplateKey = (typeof SHEET_TEMPLATE_KEYS)[number]

export const SHEET_TEMPLATES: Record<SheetTemplateKey, Record<'ja' | 'en', readonly string[]>> = {
  survey: {
    ja: ['回答日', '回答者', '学年', '質問1', '質問2', '質問3', '自由回答'],
    en: ['Date', 'Respondent', 'Year', 'Question 1', 'Question 2', 'Question 3', 'Comments'],
  },
  interviews: {
    ja: ['日付', '相手', '所属', '聞いたこと', 'わかったこと', 'メモ'],
    en: ['Date', 'Who', 'Organisation', 'What we asked', 'What we learned', 'Notes'],
  },
  references: {
    ja: ['著者', '年', 'タイトル', '出典', 'URL', 'メモ'],
    en: ['Author', 'Year', 'Title', 'Source', 'URL', 'Notes'],
  },
  data: {
    ja: ['日付', '場所', '項目', '値', '単位', 'メモ'],
    en: ['Date', 'Place', 'Item', 'Value', 'Unit', 'Notes'],
  },
}

export function parseSheetTemplate(value: unknown): SheetTemplateKey | null {
  return typeof value === 'string' && (SHEET_TEMPLATE_KEYS as readonly string[]).includes(value)
    ? (value as SheetTemplateKey)
    : null
}

export function sheetTemplateColumns(key: SheetTemplateKey, locale: string): readonly string[] {
  return SHEET_TEMPLATES[key][locale === 'en' ? 'en' : 'ja']
}

// The Sheets API spreadsheets.create body: the task's title, one tab whose
// first row is the bold, frozen header.
export function sheetCreateBody(title: string, columns: readonly string[]) {
  return {
    properties: { title },
    sheets: [
      {
        properties: { gridProperties: { frozenRowCount: 1 } },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [
              {
                values: columns.map((c) => ({
                  userEnteredValue: { stringValue: c },
                  userEnteredFormat: { textFormat: { bold: true } },
                })),
              },
            ],
          },
        ],
      },
    ],
  }
}
