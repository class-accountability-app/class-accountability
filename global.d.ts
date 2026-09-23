import type { Locale } from '@/i18n/config'
import type messages from '@/messages/ja.json'

// Typed keys: t('some.key') fails typecheck if the key isn't in ja.json.
// messages/messages.test.ts checks en.json has exactly the same keys.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: typeof messages
  }
}
