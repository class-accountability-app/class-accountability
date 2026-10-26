import { describe, expect, it } from 'vitest'
import { countText as appCount } from '@/lib/char-count'
import { countText } from './char-count'

describe('countText (Edge Function copy)', () => {
  it('agrees with lib/char-count.ts', () => {
    for (const text of [
      '',
      'Hello world',
      '統計は　面白い。\n\t次',
      '👨‍👩‍👧‍👦 family, 👍🏽 thumbs',
      'が (combining) ｶﾞ ﾊﾟ',
      '1,600 / 2,400字',
    ]) {
      expect(countText(text)).toBe(appCount(text))
    }
  })
})
