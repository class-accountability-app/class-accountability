// Pasting from Word (Prompt 12). Word doesn't put lists on the clipboard as
// <ul>/<ol>: every item is a paragraph styled `mso-list:l0 level1 lfo1`
// (class MsoListParagraph…), with its bullet or number typed in front inside
// an `[if !supportLists]` block. Pasted as is, a list becomes paragraphs
// starting with "·" or "1.". This rewrites runs of such paragraphs into real
// nested lists before the editor parses them; everything else is untouched
// (the editor's schema then drops what it doesn't support).
//
// Plain string work, no DOM, so it is tested in Node and runs the same in
// every browser. Word paragraphs never nest, so a non-greedy <p>…</p> match
// is safe.

const PARAGRAPH = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi
const MSO_LIST = /mso-list:\s*l\d+\s+level(\d+)/i
// Old Word: <![if !supportLists]>…<![endif]>. Newer Word: the same as comments.
const MARKER = /<!(?:--)?\[if !supportLists\](?:--)?>([\s\S]*?)<!(?:--)?\[endif\](?:--)?>/i
// Only whitespace and Word's comments. A comment can't contain "-->", so
// there is one way to match and no slow backtracking.
const GAP = /^(?:\s|<!--(?:(?!-->)[\s\S])*-->)*$/

type ListTag = 'ul' | 'ol'

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

// Tags removed until none are left: removing one can join the text around
// it into another.
function stripTags(html: string): string {
  let out = html
  let previous: string
  do {
    previous = out
    out = out.replace(/<[^>]*>/g, '')
  } while (out !== previous)
  return out
}

// What Word typed in front of the item, as text: "1.", "(2)", "a)", "①", "·".
// Only ever compared with listTagFor's patterns, never put back into HTML.
function markerText(html: string): string {
  return decodeEntities(stripTags(html)).replace(/\s+/g, '')
}

const ORDERED = [
  /^[(（]?[0-9０-９]+[.)）．、]$/, // 1.  1)  (1)  １．
  /^[(（][0-9０-９]+[)）]$/,
  /^[(（]?[a-zA-Zａ-ｚＡ-Ｚ]{1,4}[.)）．]$/, // a.  b)  iv.  (c)
  /^[(（][a-zA-Zａ-ｚＡ-Ｚ]{1,4}[)）]$/,
  /^[①-⑳㉑-㉟]$/,
  /^[一二三四五六七八九十]+[.)）．、]$/,
  /^[(（][一二三四五六七八九十]+[)）]$/,
]

// Anything that isn't a number or letter with punctuation is a bullet:
// "·" (Symbol), "o" (Courier New, level 2), "§" (Wingdings), "・", "-".
export function listTagFor(marker: string): ListTag {
  return ORDERED.some((re) => re.test(marker)) ? 'ol' : 'ul'
}

type Item = { level: number; tag: ListTag; body: string }

function listHtml(items: Item[]): string {
  let out = ''
  const open: { level: number; tag: ListTag }[] = []
  for (const item of items) {
    while (open.length > 0 && open[open.length - 1].level > item.level) {
      out += `</li></${open.pop()!.tag}>`
    }
    const top = open[open.length - 1]
    if (top && top.level === item.level) {
      if (top.tag === item.tag) {
        out += '</li><li>'
      } else {
        out += `</li></${top.tag}><${item.tag}><li>`
        top.tag = item.tag
      }
    } else {
      // Deeper (or the first item): a new list inside the current item.
      out += `<${item.tag}><li>`
      open.push({ level: item.level, tag: item.tag })
    }
    out += `<p>${item.body}</p>`
  }
  while (open.length > 0) out += `</li></${open.pop()!.tag}>`
  return out
}

export function wordListsToHtml(html: string): string {
  if (!/mso-list/i.test(html)) return html

  let out = ''
  let run: Item[] = []
  let last = 0

  const flush = () => {
    if (run.length > 0) out += listHtml(run)
    run = []
  }

  for (const match of html.matchAll(PARAGRAPH)) {
    const [whole, attrs, inner] = match
    const between = html.slice(last, match.index)
    last = match.index + whole.length
    const level = MSO_LIST.exec(attrs)?.[1]

    if (!level) {
      flush()
      out += between + whole
      continue
    }

    // Only whitespace (or Word's comments) between two items keeps one list.
    if (run.length > 0 && !GAP.test(between)) {
      flush()
    }
    if (run.length === 0) out += between

    const marker = MARKER.exec(inner)
    run.push({
      level: Number(level),
      tag: marker ? listTagFor(markerText(marker[1])) : 'ul',
      body: marker ? inner.replace(MARKER, '') : inner,
    })
  }
  flush()
  return out + html.slice(last)
}
