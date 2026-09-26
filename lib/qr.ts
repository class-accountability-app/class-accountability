import QRCode from 'qrcode'

// QR codes are made here, with the `qrcode` package: never by a third-party
// service, which would learn every class link. `text` must be the full
// https://…/join/{code} link, so any phone camera opens it directly.
//
// Error correction M (15%) keeps the modules large enough to scan from the
// back of a classroom while surviving a bit of glare on a projector.
const OPTIONS = {
  errorCorrectionLevel: 'M',
  margin: 2,
  color: { dark: '#3a2f22', light: '#fffdf7' },
} as const

// An <svg> string with a viewBox and no fixed size, so CSS sizes it.
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { ...OPTIONS, type: 'svg' })
}

// A PNG data URL for QRコードを保存 (runs in the browser).
export function qrPngDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { ...OPTIONS, width: 1024 })
}
