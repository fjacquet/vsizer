// Vitest + RTL bootstrap. Loaded once per worker via `setupFiles` in
// vitest.config.ts. Side effects only — no exports.
import '@testing-library/jest-dom/vitest'

// Initialize i18next with bundled resources before any component renders so
// `useTranslation()` returns real strings instead of keys during tests.
import '../i18n'
