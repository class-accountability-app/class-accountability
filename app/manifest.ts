import type { MetadataRoute } from 'next'

// The installed app (docs: CLAUDE.md, PWA). Served at /manifest.webmanifest,
// which the proxy never touches (proxy.ts matcher), so it loads logged out.
// Single theme: the app has no dark mode, so the colours are fixed.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Study Pods',
    short_name: 'Study Pods',
    description:
      '同じ授業の、小さな学習グループ。同じ授業を受けている2〜6人の「ポッド」で、課題やレポートの進み具合をゆるやかに見せ合うアプリです。',
    lang: 'ja',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // The header's surface colour, so the status bar and title bar match it.
    theme_color: '#fbf6e8',
    // The page colour: the splash screen while the app starts.
    background_color: '#f6ecd6',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
