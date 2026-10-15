import { describe, expect, it } from 'vitest'
import { PRESETS, PRESET_IDS, applyPreset, presetFor, withType, type PresetDraft } from './target-presets'

const titles = { report: '期末レポート', examStudy: 'テスト勉強', submit: '課題の提出' }
const blank: PresetDraft = { title: '', type: 'character_count', mode: 'manual', amount: '' }

describe('presets', () => {
  it('there are four, and writing in the app is a character count only', () => {
    expect(PRESET_IDS).toEqual(['report', 'write', 'study', 'submit'])
    expect(PRESETS.write).toMatchObject({ type: 'character_count', mode: 'document' })
    for (const id of PRESET_IDS) {
      if (PRESETS[id].mode === 'document') expect(PRESETS[id].type).toBe('character_count')
    }
  })

  it('presetFor finds the chip a draft matches, or none', () => {
    expect(presetFor('character_count', 'manual')).toBe('report')
    expect(presetFor('character_count', 'document')).toBe('write')
    expect(presetFor('study_hours', 'manual')).toBe('study')
    expect(presetFor('task', 'manual')).toBe('submit')
    expect(presetFor('word_count', 'manual')).toBeNull()
  })
})

describe('applyPreset', () => {
  it('fills an empty form', () => {
    expect(applyPreset('report', blank, titles)).toEqual({
      title: '期末レポート',
      type: 'character_count',
      mode: 'manual',
      amount: '2000',
    })
  })

  it('a task has no amount', () => {
    expect(applyPreset('submit', blank, titles)).toMatchObject({ type: 'task', amount: '' })
  })

  it('a title the student typed survives a change of preset; a preset title does not', () => {
    const typed = { ...blank, title: '統計学レポート' }
    expect(applyPreset('study', typed, titles).title).toBe('統計学レポート')
    const preset = { ...blank, title: '期末レポート' }
    expect(applyPreset('study', preset, titles).title).toBe('テスト勉強')
  })

  it('switching between the two report presets keeps an amount the student changed', () => {
    const changed = { ...blank, amount: '3500' }
    expect(applyPreset('write', changed, titles)).toMatchObject({ mode: 'document', amount: '3500' })
  })

  it('switching to another unit resets the amount', () => {
    const changed = { ...blank, amount: '3500' }
    expect(applyPreset('study', changed, titles)).toMatchObject({ type: 'study_hours', amount: '10' })
  })
})

describe('withType (その他の設定)', () => {
  it('a document can only be a character count', () => {
    const doc: PresetDraft = { ...blank, mode: 'document', amount: '2000' }
    expect(withType(doc, 'word_count')).toMatchObject({ type: 'word_count', mode: 'manual' })
    expect(withType(doc, 'character_count')).toMatchObject({ mode: 'document', amount: '2000' })
  })

  it('a new unit clears the amount, and a task never has one', () => {
    expect(withType({ ...blank, amount: '2000' }, 'study_hours').amount).toBe('')
    expect(withType({ ...blank, amount: '2000' }, 'task').amount).toBe('')
  })
})
