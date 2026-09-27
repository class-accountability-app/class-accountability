import type { MetadataRoute } from 'next'
import { appOrigin } from '@/lib/app-origin'

// The two public pages.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await appOrigin()
  return [
    { url: `${origin}/`, changeFrequency: 'monthly', priority: 1 },
    { url: `${origin}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
