// CSV for spreadsheets (feature batch 1: the teacher's team summary). RFC 4180
// quoting, CRLF line ends and a UTF-8 BOM so Excel opens Japanese correctly.
// A cell starting with = + - @ is prefixed with ' so a spreadsheet never runs
// it as a formula (CSV injection).
export type Cell = string | number | boolean | null

function cell(value: Cell): string {
  if (value === null) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(rows: readonly (readonly Cell[])[]): string {
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
