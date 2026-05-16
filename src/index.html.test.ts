import { describe, expect, it } from 'vitest'
// Vite's ?raw query loads the file as a string. Declared by vite/client; no
// node imports needed in this browser-typed test config.
import indexHtml from '../index.html?raw'
import themeInit from '../public/theme-init.js?raw'

describe('FOUC script externalisation (ADR-0013)', () => {
  it('index.html references /theme-init.js, no inline dark-mode logic', () => {
    expect(indexHtml).toContain('<script src="/theme-init.js"></script>')
    // Inline <script> block with localStorage access must be gone — that
    // pattern is what blocks strict CSP `script-src 'self'`.
    expect(indexHtml).not.toMatch(/<script>[\s\S]*localStorage[\s\S]*<\/script>/)
  })

  it('index.html carries the PWA head tags (ADR-0018)', () => {
    expect(indexHtml).toContain('<meta name="theme-color" content="#7e14ff" />')
    expect(indexHtml).toContain(
      '<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />',
    )
  })

  it('public/theme-init.js exists and contains the dark-class IIFE', () => {
    expect(themeInit).toContain("localStorage.getItem('vsizer-theme')")
    expect(themeInit).toContain("classList.add('dark')")
    expect(themeInit).toContain('prefers-color-scheme: dark')
  })
})
