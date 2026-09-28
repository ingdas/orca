import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CURSOR_MODELS_BUCKET_NAME } from '../../../../shared/cursor-usage-buckets'
import type { ProviderRateLimits, RateLimitWindow } from '../../../../shared/rate-limit-types'

vi.mock('@/i18n/i18n', () => ({
  i18n: { language: 'en' },
  translate: (_key: string, fallback: string, values?: Record<string, string>) => {
    let result = fallback
    for (const [key, value] of Object.entries(values ?? {})) {
      result = result.replace(`{{${key}}}`, value)
    }
    return result
  }
}))

vi.mock('@/lib/agent-catalog', () => ({
  AgentIcon: () => null
}))

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: { usagePercentageDisplay: 'used' | 'remaining' }) => unknown) =>
    selector({ usagePercentageDisplay: 'used' })
}))

function windowOf(usedPercent: number, windowMinutes: number): RateLimitWindow {
  return { usedPercent, windowMinutes, resetsAt: null, resetDescription: null }
}

// The reported shape: the 5h session has just reset while the weekly window,
// which is what the bar used to render, is still nearly two thirds consumed.
function justResetSessionLimits(): ProviderRateLimits {
  return {
    provider: 'claude',
    session: windowOf(1, 300),
    weekly: windowOf(64, 10_080),
    fableWeekly: windowOf(2, 10_080),
    updatedAt: Date.now(),
    error: null,
    status: 'ok'
  }
}

describe('verbose usage bar tracks the leading window', () => {
  it('follows the session chip after a reset instead of the tightest window', async () => {
    const { ProviderSegment } = await import('./StatusBar')

    const markup = renderToStaticMarkup(
      <ProviderSegment p={justResetSessionLimits()} compact={false} display="used" mode="verbose" />
    )

    expect(markup).toContain('1% used')
    expect(markup).toContain('width:1%')
    expect(markup).not.toContain('width:64%')
  })

  it('agrees with the session chip when the user displays "% left"', async () => {
    const { ProviderSegment } = await import('./StatusBar')

    const markup = renderToStaticMarkup(
      <ProviderSegment
        p={justResetSessionLimits()}
        compact={false}
        display="remaining"
        mode="verbose"
      />
    )

    expect(markup).toContain('99% left')
    expect(markup).toContain('width:99%')
    expect(markup).not.toContain('width:36%')
  })

  it('falls back to the weekly chip for providers without a session window', async () => {
    const { ProviderSegment } = await import('./StatusBar')

    const markup = renderToStaticMarkup(
      <ProviderSegment
        p={{
          provider: 'codex',
          session: null,
          weekly: windowOf(12, 10_080),
          fableWeekly: windowOf(80, 10_080),
          updatedAt: Date.now(),
          error: null,
          status: 'ok'
        }}
        compact={false}
        display="used"
        mode="verbose"
      />
    )

    expect(markup).toContain('width:12%')
    expect(markup).not.toContain('width:80%')
  })

  it('tracks the first visible bucket for bucket-based providers', async () => {
    const { ProviderSegment } = await import('./StatusBar')

    const markup = renderToStaticMarkup(
      <ProviderSegment
        p={{
          provider: 'cursor',
          session: null,
          weekly: null,
          monthly: windowOf(92, 43_200),
          buckets: [{ name: CURSOR_MODELS_BUCKET_NAME, ...windowOf(45, 43_200) }],
          updatedAt: Date.now(),
          error: null,
          status: 'ok'
        }}
        compact={false}
        display="used"
        mode="verbose"
      />
    )

    expect(markup).toContain('width:45%')
    expect(markup).not.toContain('width:92%')
  })

  it('leaves the compact summary on the tightest window', async () => {
    const { ProviderSegment } = await import('./StatusBar')

    const markup = renderToStaticMarkup(
      <ProviderSegment p={justResetSessionLimits()} compact={false} display="used" mode="compact" />
    )

    expect(markup).toContain('64% used')
    expect(markup).not.toContain('1% used')
  })
})
