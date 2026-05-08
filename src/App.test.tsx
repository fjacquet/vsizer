import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App, { FallbackError } from './App'

describe('App shell', () => {
  it('renders the brand heading from the common namespace', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: /vsizer/i })).toBeInTheDocument()
  })

  it('renders the upload dropzone instruction', () => {
    render(<App />)
    // Either FR or EN — the test setup loads i18n with detection disabled so
    // the fallback (fr) is used in the JSDOM environment.
    expect(screen.getByText(/glissez votre export|drop your rvtools/i)).toBeInTheDocument()
  })
})

describe('FallbackError', () => {
  it('renders the message of an Error instance', () => {
    render(<FallbackError error={new Error('boom-from-test')} resetErrorBoundary={() => {}} />)
    expect(screen.getByText('boom-from-test')).toBeInTheDocument()
  })

  it('coerces non-Error throws to a string', () => {
    render(<FallbackError error={'string-throw'} resetErrorBoundary={() => {}} />)
    expect(screen.getByText('string-throw')).toBeInTheDocument()
  })
})
