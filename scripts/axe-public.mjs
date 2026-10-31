// Accessibility check (axe-core, WCAG 2.1 AA) of the pages that need no login.
// Start a production build first, then: node scripts/axe-public.mjs [baseUrl]
// Logged-in pages are checked by the author in Chrome DevTools (never with a
// captured session; CLAUDE.md, Working style).
import { createRequire } from 'node:module'

// Playwright is preinstalled on the machine, not a project dependency.
const load = createRequire(import.meta.url)
const { chromium } = load('playwright')
const axe = load('axe-core')

const base = process.argv[2] ?? 'http://localhost:3000'
const PAGES = ['/', '/login', '/privacy', '/offline.html']

await (async () => {
  const browser = await chromium.launch()
  let failed = 0
  for (const locale of ['ja', 'en']) {
    // Reduced motion: the landing page's fade-ins would otherwise be measured mid-way.
    const ctx = await browser.newContext({ locale, reducedMotion: 'reduce', viewport: { width: 390, height: 844 } })
    await ctx.addCookies([{ name: 'locale', value: locale, url: base }])
    const page = await ctx.newPage()
    for (const path of PAGES) {
      await page.goto(base + path, { waitUntil: 'networkidle' })
      await page.addScriptTag({ content: axe.source })
      const violations = await page.evaluate(
        async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })).violations
      )
      for (const v of violations) {
        failed++
        console.log(`${locale} ${path}: ${v.impact} ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`)
      }
      if (violations.length === 0) console.log(`${locale} ${path}: ok`)
    }
    await ctx.close()
  }
  await browser.close()
  process.exit(failed ? 1 : 0)
})()
