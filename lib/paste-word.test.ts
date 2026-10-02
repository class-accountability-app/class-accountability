import { describe, expect, it } from 'vitest'
import { listTagFor, wordListsToHtml } from './paste-word'

// Shaped like Word for Windows' clipboard HTML (Office 365, Japanese UI).
const bullet = (level: number, text: string, cls = 'MsoListParagraphCxSpMiddle', mark = '·') =>
  `<p class=${cls} style='margin-left:${level * 21}.0pt;mso-para-margin-left:0gd;text-indent:-21.0pt;mso-list:l0 level${level} lfo1'>` +
  `<![if !supportLists]><span lang=EN-US style='font-family:Symbol'><span style='mso-list:Ignore'>${mark}<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>` +
  `<span style='font-family:"游明朝",serif'>${text}<o:p></o:p></span></p>`

const numbered = (level: number, mark: string, text: string) =>
  `<p class=MsoListParagraph style='margin-left:21.0pt;text-indent:-21.0pt;mso-list:l1 level${level} lfo2'>` +
  `<!--[if !supportLists]--><span lang=EN-US><span style='mso-list:Ignore'>${mark}<span style='font:7.0pt "Times New Roman"'>&nbsp; </span></span></span><!--[endif]-->` +
  `<span>${text}</span></p>`

const normal = (text: string) => `<p class=MsoNormal><span>${text}<o:p></o:p></span></p>`

const strip = (html: string) => html.replace(/<span[^>]*>|<\/span>|<o:p><\/o:p>/g, '')

describe('wordListsToHtml', () => {
  it('leaves HTML without Word lists alone', () => {
    const html = '<p>本文</p><ul><li>普通のリスト</li></ul>'
    expect(wordListsToHtml(html)).toBe(html)
  })

  it('turns a bullet list into <ul>, dropping the typed bullets', () => {
    const html = normal('前') + bullet(1, '一つ目', 'MsoListParagraphCxSpFirst') + '\r\n' + bullet(1, '二つ目', 'MsoListParagraphCxSpLast') + normal('後')
    expect(strip(wordListsToHtml(html))).toBe(
      '<p class=MsoNormal>前</p><ul><li><p>一つ目</p></li><li><p>二つ目</p></li></ul><p class=MsoNormal>後</p>'
    )
  })

  it('nests by level, and Word’s "o" second-level bullet stays a bullet', () => {
    const html = bullet(1, 'A') + bullet(2, 'A-1', undefined, 'o') + bullet(2, 'A-2', undefined, 'o') + bullet(1, 'B')
    expect(strip(wordListsToHtml(html))).toBe(
      '<ul><li><p>A</p><ul><li><p>A-1</p></li><li><p>A-2</p></li></ul></li><li><p>B</p></li></ul>'
    )
  })

  it('turns numbered items (comment-style markers) into <ol>', () => {
    const html = numbered(1, '1.', '背景') + numbered(1, '2.', '目的') + numbered(2, '(1)', '詳細')
    expect(strip(wordListsToHtml(html))).toBe(
      '<ol><li><p>背景</p></li><li><p>目的</p><ol><li><p>詳細</p></li></ol></li></ol>'
    )
  })

  it('a change of list kind at the same level starts a new list', () => {
    const html = numbered(1, '1.', 'x') + bullet(1, 'y')
    expect(strip(wordListsToHtml(html))).toBe('<ol><li><p>x</p></li></ol><ul><li><p>y</p></li></ul>')
  })

  it('text between two lists keeps them apart', () => {
    const html = bullet(1, 'a') + normal('間') + bullet(1, 'b')
    expect(strip(wordListsToHtml(html))).toBe(
      '<ul><li><p>a</p></li></ul><p class=MsoNormal>間</p><ul><li><p>b</p></li></ul>'
    )
  })

  it('keeps bold and italic inside an item', () => {
    const html = bullet(1, '<b>太字</b>と<i>斜体</i>')
    expect(strip(wordListsToHtml(html))).toBe('<ul><li><p><b>太字</b>と<i>斜体</i></p></li></ul>')
  })

  it('keeps what comes before and after (Word’s head and fragment comments)', () => {
    const html = '<html><body><!--StartFragment-->' + bullet(1, 'a') + '<!--EndFragment--></body></html>'
    expect(strip(wordListsToHtml(html))).toBe(
      '<html><body><!--StartFragment--><ul><li><p>a</p></li></ul><!--EndFragment--></body></html>'
    )
  })
})

describe('listTagFor', () => {
  it.each(['1.', '12)', '(3)', '１．', '（２）', 'a.', 'b)', 'iv.', '(c)', '①', '⑩', '一、', '（三）'])('%s is numbered', (m) => {
    expect(listTagFor(m)).toBe('ol')
  })
  it.each(['·', 'o', '§', '・', '-', '•', '■', ''])('%j is a bullet', (m) => {
    expect(listTagFor(m)).toBe('ul')
  })
})
