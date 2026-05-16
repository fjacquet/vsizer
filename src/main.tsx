import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
// i18n must initialize before App renders so `useTranslation()` resolves
// keys synchronously on the first paint.
import './i18n'
import './index.css'
import { registerSW } from './pwa/registerSW'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('vsizer: missing #root element in index.html')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// After render so SW install never competes with first paint. No-op in dev
// (devOptions.enabled: false in vite.config.ts).
registerSW()
