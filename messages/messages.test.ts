import { describe, expect, it } from 'vitest'
import ja from './ja.json'
import en from './en.json'

type Tree = { [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(path, value)
    else for (const [k, v] of flatten(value, path)) out.set(k, v)
  }
  return out
}

// Argument names ({name}) and rich-text tags (<sender>) a message uses.
function slots(message: string): string[] {
  const args = [...message.matchAll(/\{(\w+)/g)].map((m) => `{${m[1]}}`)
  const tags = [...message.matchAll(/<(\w+)>/g)].map((m) => `<${m[1]}>`)
  return [...new Set([...args, ...tags])].sort()
}

describe('message files', () => {
  const jaFlat = flatten(ja)
  const enFlat = flatten(en)

  it('have exactly the same keys', () => {
    expect([...enFlat.keys()].sort()).toEqual([...jaFlat.keys()].sort())
  })

  it('use the same placeholders and tags for every key', () => {
    for (const [key, jaMessage] of jaFlat) {
      expect(slots(enFlat.get(key) ?? ''), key).toEqual(slots(jaMessage))
    }
  })

  it('have no empty messages', () => {
    for (const [key, message] of [...jaFlat, ...enFlat]) {
      expect(message.trim(), key).not.toBe('')
    }
  })
})
