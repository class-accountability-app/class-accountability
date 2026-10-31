import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('quotes commas, quotes and newlines and starts with a BOM', () => {
    expect(toCsv([['チーム', 'a,b'], [1, 'say "hi"'], [null, 'x\ny']])).toBe(
      '﻿チーム,"a,b"\r\n1,"say ""hi"""\r\n,"x\ny"\r\n'
    )
  })

  it('neutralises spreadsheet formulas in text cells', () => {
    expect(toCsv([['=SUM(A1)', '-1', 5]])).toBe("﻿'=SUM(A1),'-1,5\r\n")
  })
})
