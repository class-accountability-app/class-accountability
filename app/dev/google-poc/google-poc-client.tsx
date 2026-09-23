'use client'

import { useEffect, useState } from 'react'

type PickerDoc = { id: string; name: string }
type PickerResponse = { action: string; docs?: PickerDoc[] }

interface PickerInstance {
  setVisible: (visible: boolean) => void
}

interface PickerBuilder {
  addView: (view: unknown) => PickerBuilder
  setOAuthToken: (token: string) => PickerBuilder
  setDeveloperKey: (key: string) => PickerBuilder
  setAppId: (appId: string) => PickerBuilder
  setOrigin: (origin: string) => PickerBuilder
  setCallback: (cb: (data: PickerResponse) => void) => PickerBuilder
  build: () => PickerInstance
}

interface GooglePickerNamespace {
  DocsView: new (viewId: unknown) => unknown
  ViewId: { DOCUMENTS: unknown }
  Action: { PICKED: string }
  PickerBuilder: new () => PickerBuilder
}

declare global {
  interface Window {
    gapi?: { load: (api: string, callback: () => void) => void }
    google?: { picker: GooglePickerNamespace }
  }
}

type DocStats = {
  charsWithSpaces: number
  charsNoSpaces: number
  modifiedTime: string
  name: string
  forceRefreshed: boolean
}

export function GooglePocClient() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [pickerReady, setPickerReady] = useState(false)
  const [fileId, setFileId] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [stats, setStats] = useState<DocStats | null>(null)
  const [error, setError] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('error')
  )
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/google/status')
      .then((r) => r.json())
      .then((d) => setConnected(!!d.connected))
      .catch(() => setConnected(false))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') || params.get('error')) {
      window.history.replaceState({}, '', '/dev/google-poc')
    }
  }, [])

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.onload = () => {
      window.gapi?.load('picker', () => setPickerReady(true))
    }
    document.body.appendChild(script)
    return () => {
      document.body.removeChild(script)
    }
  }, [])

  async function openPicker() {
    setError(null)
    const res = await fetch('/api/google/picker-token')
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Could not get a Google access token.')
      return
    }
    if (!window.google) {
      setError('Google Picker script has not loaded yet.')
      return
    }

    const picker = window.google.picker
    const view = new picker.DocsView(picker.ViewId.DOCUMENTS)
    const builder = new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(data.accessToken)
      .setDeveloperKey(process.env.NEXT_PUBLIC_GOOGLE_API_KEY as string)
      .setAppId(process.env.NEXT_PUBLIC_GOOGLE_APP_ID as string)
      .setOrigin(window.location.origin)
      .setCallback((pickerData: PickerResponse) => {
        if (pickerData.action === picker.Action.PICKED && pickerData.docs?.[0]) {
          setFileId(pickerData.docs[0].id)
          setFileName(pickerData.docs[0].name)
          setStats(null)
        }
      })
    builder.build().setVisible(true)
  }

  async function readDoc(forceRefresh: boolean) {
    if (!fileId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/google/doc-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, forceRefresh }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Read failed.')
      setStats(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Read failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {error && <p className="text-sm text-red-700">{error}</p>}

      {connected === false && (
        <a
          href="/api/google/connect"
          className="btn rounded-[2px] bg-accent px-3 py-3 text-center text-sm font-medium text-white"
        >
          Connect Google
        </a>
      )}

      {connected && (
        <>
          <p className="text-sm text-muted">Connected to Google.</p>
          <button
            type="button"
            disabled={!pickerReady}
            onClick={openPicker}
            className="btn rounded-[2px] bg-accent px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            Pick a Doc
          </button>
        </>
      )}

      {fileId && (
        <div className="flex flex-col gap-2 rounded-[2px] border border-border bg-surface p-4">
          <span className="text-sm font-medium text-ink">{fileName}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => readDoc(false)}
              className="btn rounded-[2px] bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              Read Doc
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => readDoc(true)}
              className="btn rounded-[2px] bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              Force refresh + Read Doc
            </button>
          </div>
        </div>
      )}

      {stats && (
        <div className="flex flex-col gap-1 rounded-[2px] border border-border bg-surface p-4 text-sm text-ink">
          <span>Characters (with spaces): {stats.charsWithSpaces}</span>
          <span>Characters (no spaces/line breaks): {stats.charsNoSpaces}</span>
          <span>Modified: {new Date(stats.modifiedTime).toLocaleString()}</span>
          {stats.forceRefreshed && (
            <span className="font-meta text-xs text-muted">
              Token was force-refreshed for this read.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
