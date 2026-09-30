import { describe, expect, it } from 'vitest'
import { isConfirmWord } from './delete-account'

describe('isConfirmWord', () => {
  it('accepts 削除 and delete, in either language', () => {
    expect(isConfirmWord('削除')).toBe(true)
    expect(isConfirmWord('delete')).toBe(true)
  })

  it('ignores surrounding spaces, case and full-width letters', () => {
    expect(isConfirmWord('  削除 ')).toBe(true)
    expect(isConfirmWord('Delete')).toBe(true)
    expect(isConfirmWord('ＤＥＬＥＴＥ')).toBe(true)
    expect(isConfirmWord('　削除　')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isConfirmWord('')).toBe(false)
    expect(isConfirmWord('削')).toBe(false)
    expect(isConfirmWord('delete account')).toBe(false)
    expect(isConfirmWord('さくじょ')).toBe(false)
    expect(isConfirmWord(null)).toBe(false)
    expect(isConfirmWord(undefined)).toBe(false)
  })
})
