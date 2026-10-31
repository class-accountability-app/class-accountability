import type { MetadataRoute } from 'next'

// The installed app (docs: CLAUDE.md, PWA). Served at /manifest.webmanifest,
// which the proxy never touches (proxy.ts matcher), so it loads logged out.
// Single theme: the app has no dark mode, so the colours are fixed.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Study Pods',
    short_name: 'Study Pods',
    description:
      'グループ課題のための、チームの進捗ボード。同じ授業の2〜6人のチームで、発表やレポートをタスクに分けて進めます。',
    lang: 'ja',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // The header's surface colour, so the status bar and title bar match it.
    theme_color: '#f8fafd',
    // The page colour: the splash screen while the app starts.
    background_color: '#f8fafd',
    // Feature batch 1: long-press the app icon to jump straight to the team
    // board (Home redirects there), the fastest way to ＋記録.
    shortcuts: [{ name: 'チームのボード', short_name: 'ボード', url: '/?from=shortcut' }],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
