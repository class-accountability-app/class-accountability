'use client'

import { primaryButtonClass } from '@/components/buttons'

// The browser's print dialog; "Save as PDF" there makes the PDF.
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={primaryButtonClass}>
      {label}
    </button>
  )
}
