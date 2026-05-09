import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTheme } from './useTheme'

const STORAGE_KEY = 'vsizer-theme'

let mediaListeners: Array<(e: MediaQueryListEvent) => void> = []
let prefersDark = false

const installMatchMediaMock = () => {
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return prefersDark
      },
      media: query,
      onchange: null,
      addEventListener: (_type: 'change', listener: (e: MediaQueryListEvent) => void) => {
        mediaListeners.push(listener)
      },
      removeEventListener: (_type: 'change', listener: (e: MediaQueryListEvent) => void) => {
        mediaListeners = mediaListeners.filter((l) => l !== listener)
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

const fireOsChange = (matches: boolean) => {
  prefersDark = matches
  for (const l of mediaListeners) {
    l({ matches } as MediaQueryListEvent)
  }
}

describe('useTheme', () => {
  beforeEach(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // some vitest jsdom configs expose localStorage as a stub without
      // mutators; the hook's persistPreference catches the same way.
    }
    document.documentElement.classList.remove('dark')
    mediaListeners = []
    prefersDark = false
    installMatchMediaMock()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('defaults to preference="auto" when nothing is stored', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.preference).toBe('auto')
  })

  it('resolves to light when OS prefers light and preference is auto', () => {
    prefersDark = false
    const { result } = renderHook(() => useTheme())
    expect(result.current.resolved).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('resolves to dark when OS prefers dark and preference is auto', () => {
    prefersDark = true
    const { result } = renderHook(() => useTheme())
    expect(result.current.resolved).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('setPreference("dark") flips resolved + adds .dark to <html>', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPreference('dark'))
    expect(result.current.resolved).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('setPreference("auto") flips back to OS-driven', () => {
    prefersDark = false
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPreference('dark'))
    expect(result.current.resolved).toBe('dark')
    act(() => result.current.setPreference('auto'))
    // OS prefers light → resolved should follow OS again.
    expect(result.current.resolved).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('reacts to OS theme changes when preference is "auto"', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.resolved).toBe('light')
    act(() => fireOsChange(true))
    expect(result.current.resolved).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('does not react to OS changes when preference is explicit', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setPreference('light'))
    act(() => fireOsChange(true))
    // Still light because the user pinned it.
    expect(result.current.resolved).toBe('light')
  })
})
