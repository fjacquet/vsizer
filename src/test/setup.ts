// Vitest + RTL bootstrap. Loaded once per worker via `setupFiles` in
// vitest.config.ts. Side effects only — no exports.
import '@testing-library/jest-dom/vitest'

// Initialize i18next with bundled resources before any component renders so
// `useTranslation()` returns real strings instead of keys during tests.
import '../i18n'

// jsdom doesn't implement `window.matchMedia` — `useTheme` calls it on
// mount. Stub a minimal shape that the hook treats as "no preference"
// (light mode by default; tests can override per-suite if needed).
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
