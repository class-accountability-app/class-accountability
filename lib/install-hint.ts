// Which 「ホーム画面に追加」 help 設定 shows (app/settings/install-row.tsx).
// Pure, so every case is unit-tested; the browser facts come from the caller.
//
// - installed:  already running as the installed app: show nothing.
// - ios-in-app / in-app: LINE, Instagram or Facebook's own browser can't add
//   to the home screen; say to open the page in Safari (iPhone) or a browser.
// - prompt:     the browser offered its own install prompt (Android Chrome,
//   desktop Chrome/Edge): a button that opens it.
// - ios:        iPhone or iPad: the share-menu steps (Safari, and since
//   iOS 16.4 Chrome and others too, have ホーム画面に追加 there).
// - none:       nothing to offer (e.g. desktop Firefox): hide the row.
export type InstallHint = 'installed' | 'ios-in-app' | 'in-app' | 'prompt' | 'ios' | 'none'

export type InstallEnv = {
  userAgent: string
  // iPadOS reports itself as a Mac; a touch screen tells them apart.
  maxTouchPoints: number
  // display-mode: standalone, or iOS's navigator.standalone.
  standalone: boolean
  // A beforeinstallprompt event was caught and not used yet.
  promptAvailable: boolean
}

const IN_APP_BROWSER = /\bLine\/|Instagram|FBAN|FBAV|FB_IAB/i

export function isIOS(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
}

export function getInstallHint(env: InstallEnv): InstallHint {
  if (env.standalone) return 'installed'
  const ios = isIOS(env.userAgent, env.maxTouchPoints)
  if (IN_APP_BROWSER.test(env.userAgent)) return ios ? 'ios-in-app' : 'in-app'
  if (env.promptAvailable) return 'prompt'
  if (ios) return 'ios'
  return 'none'
}
