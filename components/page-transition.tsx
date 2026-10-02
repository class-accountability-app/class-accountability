import { ViewTransition } from 'react'

// Page transitions (Prompt 11). Used by every template.tsx: a template,
// unlike a layout, remounts when the segment right below it changes, so this
// boundary's enter/exit fire on each navigation at that level. The root
// template covers the top-level pages (the four tabs); app/classes,
// app/classes/[classId] and app/settings have their own for the pages
// inside them. Only the page content moves; the header and tab bar live in
// the root layout and stay still (globals.css names them).
// - between the bottom tabs: a short horizontal slide in the tab's direction
//   (Link transitionTypes, lib/nav.ts)
// - every other navigation: a quick fade
// - default="none": logging, server-action refreshes and anything else that
//   isn't a navigation never animate
// Browsers without view transitions switch at once; under reduced motion
// nothing moves (globals.css).
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ 'tab-forward': 'tab-forward', 'tab-back': 'tab-back', default: 'page-fade' }}
      exit={{ 'tab-forward': 'tab-forward', 'tab-back': 'tab-back', default: 'page-fade' }}
      default="none"
    >
      {children}
    </ViewTransition>
  )
}
