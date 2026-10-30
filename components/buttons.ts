// The two button looks (Prompt 11b), in Material 3 shape since item H: a
// filled pill (primary) and an outlined pill (secondary). One primary per
// screen area, so ＋記録 never has a competing filled button next to it.
// Both are 44px tall.
export const primaryButtonClass =
  'btn inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-accent px-5 text-[15px] font-medium whitespace-nowrap text-white disabled:opacity-50'

export const secondaryButtonClass =
  'inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-transparent px-5 text-accent-text text-[15px] font-medium whitespace-nowrap shadow-[inset_0_0_0_1px_#747775] hover:bg-primary-container/40 disabled:opacity-50'
