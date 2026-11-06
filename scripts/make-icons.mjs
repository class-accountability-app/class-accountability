// Renders every app icon and favicon from docs/icons/sp-mark.svg (the sp mark).
//   node scripts/make-icons.mjs
// Writes: public/icons/icon-192.png, icon-512.png, icon-maskable-512.png,
// app/apple-icon.png + public/apple-touch-icon(-precomposed).png (180),
// app/icon2.png (192), app/icon1.png (32) and app/favicon.ico (16, 32, 48).
// After running it, bump VERSION in public/sw.js (it caches the icons).
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'

// Playwright is preinstalled on the machine, not a project dependency.
const load = createRequire(import.meta.url)
const { chromium } = load('playwright')

const svg = readFileSync('docs/icons/sp-mark.svg', 'utf8')
// The letters only (everything after the tile).
const letters = svg.slice(svg.indexOf('<path'), svg.lastIndexOf('</svg>'))
// The letters' box is x 22.5–79, y 35–80; centre them on (50, 50).
const centred = (scale) =>
  `<g transform="translate(50 50) scale(${scale}) translate(-50.7 -57.5)">${letters}</g>`

// Full-bleed square: iPhone and Android crop it to their own shape, and the
// letters stay inside the maskable safe zone (a circle of radius 40).
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#ebdbd3"/>${centred(1.1)}</svg>`
// Browser tab: the rounded tile, a little larger letters so 16px stays readable.
const tab = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#ebdbd3"/>${centred(1.18)}</svg>`

const browser = await chromium.launch()
const page = await browser.newPage()
async function png(art, size) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${art.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`
  )
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
}

const out = {
  'public/icons/icon-192.png': [fullBleed, 192],
  'public/icons/icon-512.png': [fullBleed, 512],
  'public/icons/icon-maskable-512.png': [fullBleed, 512],
  'app/apple-icon.png': [fullBleed, 180],
  'public/apple-touch-icon.png': [fullBleed, 180],
  'public/apple-touch-icon-precomposed.png': [fullBleed, 180],
  'app/icon2.png': [fullBleed, 192],
  'app/icon1.png': [tab, 32],
}
for (const [file, [art, size]] of Object.entries(out)) {
  writeFileSync(file, await png(art, size))
  console.log('wrote', file, size)
}

// favicon.ico holding PNG images (allowed since Windows Vista; every current browser reads it).
const images = []
for (const size of [16, 32, 48]) images.push({ size, data: await png(tab, size) })
await browser.close()
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(images.length, 4)
let offset = 6 + 16 * images.length
const entries = images.map(({ size, data }) => {
  const e = Buffer.alloc(16)
  e.writeUInt8(size, 0)
  e.writeUInt8(size, 1)
  e.writeUInt8(0, 2) // no palette
  e.writeUInt8(0, 3)
  e.writeUInt16LE(1, 4) // colour planes
  e.writeUInt16LE(32, 6) // bits per pixel
  e.writeUInt32LE(data.length, 8)
  e.writeUInt32LE(offset, 12)
  offset += data.length
  return e
})
writeFileSync('app/favicon.ico', Buffer.concat([header, ...entries, ...images.map((i) => i.data)]))
console.log('wrote app/favicon.ico 16, 32, 48')
