// The two button looks (Prompt 11b). One primary (filled accent) per screen
// area, everything else secondary (outlined), so ＋記録 never has a
// competing filled button next to it. Both are 44px tall.
export const primaryButtonClass =
  'btn inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[2px] bg-accent px-4 text-[15px] font-semibold whitespace-nowrap text-white disabled:opacity-50'

export const secondaryButtonClass =
  'inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[2px] bg-[#fffdf7] px-4 text-[15px] font-semibold whitespace-nowrap text-ink shadow-[inset_0_0_0_1px_#b9a57c] disabled:opacity-50'
