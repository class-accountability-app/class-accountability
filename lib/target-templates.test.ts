import { describe, expect, it } from 'vitest'
import { TEMPLATES, TEMPLATE_IDS, applyTemplate, type TargetDraft } from './target-templates'
import { isTargetType } from './targets'

const titles = { report: '期末レポート', examStudy: 'テスト勉強', submit: '課題の提出' }
const blank: TargetDraft = { title: '', type: 'task', amount: '' }

describe('target templates', () => {
  it('map every chip to an existing target type', () => {
    for (const fill of Object.values(TEMPLATES)) expect(isTargetType(fill.type)).toBe(true)
    expect(TEMPLATE_IDS).toHaveLength(5)
  })

  it.each([
    ['report2000', { title: '期末レポート', type: 'character_count', amount: '2000' }],
    ['report4000', { title: '期末レポート', type: 'character_count', amount: '4000' }],
    ['study10', { title: 'テスト勉強', type: 'study_hours', amount: '10' }],
    ['submit', { title: '課題の提出', type: 'task', amount: '' }],
  ] as const)('%s fills type, amount and a title', (id, expected) => {
    expect(applyTemplate(id, blank, titles)).toEqual(expected)
  })

  it('自分で決める keeps the type and clears title and amount', () => {
    const current: TargetDraft = { title: 'My essay', type: 'word_count', amount: '1500' }
    expect(applyTemplate('custom', current, titles)).toEqual({
      title: '',
      type: 'word_count',
      amount: '',
    })
  })
})
