// The two button looks (Prompt 11b), in the soft pastel shape since
// 2026-11-06: a filled Umbra pill (primary) and a white pill with an Umbra
// outline (secondary). One primary per screen area, so ＋記録 never has a
// competing filled button next to it. Both are 48px tall.
export const primaryButtonClass =
  'btn inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-full bg-accent px-6 text-[15px] font-semibold whitespace-nowrap text-white disabled:opacity-50'

export const secondaryButtonClass =
  'inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-full bg-surface px-6 text-ink text-[15px] font-semibold whitespace-nowrap shadow-[inset_0_0_0_2px_var(--ink)] hover:bg-surface-container disabled:opacity-50'
