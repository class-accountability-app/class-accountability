import type { MetadataRoute } from 'next'
import { appOrigin } from '@/lib/app-origin'

// Only the landing page and the privacy policy are for search engines; every
// page behind the login is also noindex (app/layout.tsx). The preview image
// and page assets stay fetchable so link previews and the two pages render.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await appOrigin()
  return {
    rules: {
      userAgent: '*',
      allow: ['/$', '/privacy$', '/opengraph-image', '/_next/'],
      disallow: '/',
    },
    sitemap: `${origin}/sitemap.xml`,
  }
}
