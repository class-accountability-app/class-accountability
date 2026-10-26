'use client'

// Google's file picker (Picker API), loaded from apis.google.com on first
// use. With the drive.file scope, picking a file is what lets the app read
// it: the picker shows the student's own files, and the app sees only the one
// chosen. The access token comes from googlePickerToken() for this student's
// own browser; the API key and app id are public by design.

type PickerDoc = { id: string; name: string }
type PickerData = { action: string; docs?: PickerDoc[] }
type PickerBuilder = {
  addView: (view: unknown) => PickerBuilder
  setOAuthToken: (token: string) => PickerBuilder
  setDeveloperKey: (key: string) => PickerBuilder
  setAppId: (appId: string) => PickerBuilder
  setOrigin: (origin: string) => PickerBuilder
  setLocale: (locale: string) => PickerBuilder
  setCallback: (cb: (data: PickerData) => void) => PickerBuilder
  build: () => { setVisible: (visible: boolean) => void }
}
type PickerNamespace = {
  DocsView: new (viewId: unknown) => { setMode?: (mode: unknown) => unknown }
  ViewId: { DOCUMENTS: unknown; PRESENTATIONS: unknown }
  Action: { PICKED: string; CANCEL: string }
  PickerBuilder: new () => PickerBuilder
}

declare global {
  interface Window {
    gapi?: { load: (api: string, callback: () => void) => void }
    google?: { picker?: PickerNamespace }
  }
}

let loading: Promise<PickerNamespace> | null = null

function loadPicker(): Promise<PickerNamespace> {
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const done = () => (window.google?.picker ? resolve(window.google.picker) : reject(new Error('picker')))
    if (window.gapi) return window.gapi.load('picker', done)
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.async = true
    script.onload = () => window.gapi?.load('picker', done)
    script.onerror = () => {
      loading = null
      reject(new Error('picker'))
    }
    document.head.appendChild(script)
  })
  return loading
}

// Opens the picker for Docs or Slides; resolves with the chosen file, or null
// when the student closes it.
export async function pickGoogleFile(
  kind: 'doc' | 'slides',
  token: string,
  locale: string
): Promise<PickerDoc | null> {
  const picker = await loadPicker()
  return new Promise((resolve) => {
    const view = new picker.DocsView(kind === 'slides' ? picker.ViewId.PRESENTATIONS : picker.ViewId.DOCUMENTS)
    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? '')
      .setAppId(process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? '')
      .setOrigin(window.location.origin)
      .setLocale(locale)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED && data.docs?.[0]) resolve(data.docs[0])
        else if (data.action === picker.Action.CANCEL) resolve(null)
      })
      .build()
      .setVisible(true)
  })
}
