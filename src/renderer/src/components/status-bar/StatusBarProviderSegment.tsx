import { AlertTriangle } from 'lucide-react'
import React from 'react'
import type { ProviderRateLimits, RateLimitWindow } from '../../../../shared/rate-limit-types'
import {
  getDisplayedUsagePercentage,
  type UsagePercentageDisplay
} from '../../../../shared/usage-percentage-display'
import type { StatusBarUsageMode } from '../../../../shared/status-bar-usage-mode'
import {
  ProviderIcon,
  USAGE_URGENT_PERCENT,
  USAGE_WARNING_PERCENT,
  clampUsedPercent,
  getProviderDisplayName,
  getProviderUsageStatusLabel
} from './tooltip'
import { getTightestUsageSection } from './UsageRosterPanel'
import { formatRateLimitWindowChipLabel } from '@/lib/window-label-formatter'
import { formatUsagePercentageLabel } from './usage-percentage-label'
import { translate } from '@/i18n/i18n'
import { isCursorUsageBucket } from '../../../../shared/cursor-usage-buckets'

function MiniBar({
  usedPct,
  display
}: {
  usedPct: number
  display: UsagePercentageDisplay
}): React.JSX.Element {
  return (
    <div
      data-usage-bar
      className="w-[48px] h-[6px] rounded-full bg-muted overflow-hidden flex-shrink-0"
    >
      <div
        className="h-full rounded-full transition-all duration-300 bg-muted-foreground/40"
        style={{ width: `${getDisplayedUsagePercentage(usedPct, display)}%` }}
      />
    </div>
  )
}

function WindowLabel({
  w,
  label,
  display,
  showLabel = true
}: {
  w: RateLimitWindow
  label: string
  display: UsagePercentageDisplay
  showLabel?: boolean
}): React.JSX.Element {
  return (
    <span className="tabular-nums">
      {formatUsagePercentageLabel(w.usedPercent, display)}
      {showLabel ? ` ${label}` : ''}
    </span>
  )
}

// Single-letter provider badge for the icon-only (narrow) status bar. Shared by
// the roster trigger and ProviderDetailsMenu so the dot's has-data condition
// and markup can't drift between the two.
export function ProviderLetterBadge({ p }: { p: ProviderRateLimits }): React.JSX.Element {
  const hasData = Boolean(p.session || p.weekly || p.fableWeekly || p.monthly || p.buckets?.length)
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span
        className={`inline-block h-2 w-2 rounded-full ${hasData ? 'bg-muted-foreground/60' : 'bg-muted-foreground/30'}`}
      />
      {getProviderLetter(p.provider)}
    </span>
  )
}

export type UsageTone = 'urgent' | 'warning' | 'normal'

/** Urgency by consumption, matching the usage bar colors, whatever % display the user chose. */
export function getUsageTone(p: ProviderRateLimits): UsageTone {
  const tightest = getTightestUsageSection(p)
  const used = tightest ? clampUsedPercent(tightest.window.usedPercent) : 0
  return used >= USAGE_URGENT_PERCENT
    ? 'urgent'
    : used >= USAGE_WARNING_PERCENT
      ? 'warning'
      : 'normal'
}

/**
 * Stands in for usage chips a narrow bar can't fit. Always rendered at the collapsing
 * density so its width is known before anything collapses; out of the row while empty.
 */
export function UsageOverflowChip({
  hidden,
  display
}: {
  hidden: readonly ProviderRateLimits[]
  display: UsagePercentageDisplay
}): React.JSX.Element {
  const tones = hidden.map(getUsageTone)
  const tone = tones.includes('urgent')
    ? 'urgent'
    : tones.includes('warning')
      ? 'warning'
      : 'normal'
  const names = hidden
    .map((p) => {
      const tightest = getTightestUsageSection(p)
      const name = getProviderDisplayName(p.provider)
      return tightest
        ? `${name} ${formatUsagePercentageLabel(tightest.window.usedPercent, display)}`
        : name
    })
    .join(', ')
  return (
    <span
      data-usage-more
      data-usage-collapsed={hidden.length === 0}
      data-tone={tone}
      aria-hidden={hidden.length === 0}
      title={translate(
        'auto.components.status.bar.StatusBar.hiddenUsageProviders',
        'Also: {{value0}}',
        {
          value0: names
        }
      )}
      className="inline-flex h-4 items-center rounded-full border border-border px-1.5 text-[11px] font-medium tabular-nums text-foreground data-[tone=urgent]:border-destructive/40 data-[tone=urgent]:text-destructive data-[tone=warning]:border-status-warning-border data-[tone=warning]:text-status-warning data-[usage-collapsed=true]:invisible data-[usage-collapsed=true]:absolute"
    >
      +{Math.max(1, hidden.length)}
    </span>
  )
}

function getProviderLetter(provider: ProviderRateLimits['provider']): string {
  switch (provider) {
    case 'claude':
      return 'C'
    case 'gemini':
      return 'G'
    case 'opencode-go':
      return 'O'
    case 'kimi':
      return 'K'
    case 'antigravity':
      return 'A'
    case 'minimax':
      return 'M'
    case 'grok':
      return 'R'
    case 'cursor':
      return 'U'
    case 'zcode':
      return 'Z'
    case 'codex':
      return 'X'
  }
}

// ---------------------------------------------------------------------------
// Provider segment
// ---------------------------------------------------------------------------

// Why: Gemini exposes extra experimental buckets that made the pre-existing verbose footer noisy.
const STATUS_BAR_BUCKET_NAMES = new Set(['Flash', 'Pro', '1.5 Pro'])

// Why: the allowlist above is Gemini's. Cursor's pools are its whole meter — filtering
// them out leaves a signed-in account with an icon and no number at all.
function isVisibleStatusBarBucket(name: string): boolean {
  return STATUS_BAR_BUCKET_NAMES.has(name) || isCursorUsageBucket(name)
}

type VerboseUsageChip =
  | { kind: 'bucket'; key: string; name: string; usedPercent: number }
  | { kind: 'window'; key: string; window: RateLimitWindow; label: string }

// The chips the verbose footer renders, in render order. The mini bar reads the
// first one from here so it can't drift from the number printed beside it.
function getVerboseUsageChips(p: ProviderRateLimits): VerboseUsageChip[] {
  if (p.buckets && p.buckets.length > 0) {
    const visibleBuckets = p.buckets.filter((bucket) => isVisibleStatusBarBucket(bucket.name))
    if (visibleBuckets.length > 0) {
      return visibleBuckets.map((bucket) => ({
        kind: 'bucket',
        key: bucket.name,
        name: bucket.name,
        usedPercent: bucket.usedPercent
      }))
    }
    // Why: a provider whose buckets are all filtered out still has a headline
    // window worth showing rather than rendering an empty segment.
    const fallbackWindow = p.session ?? p.monthly ?? null
    return fallbackWindow
      ? [
          {
            kind: 'window',
            key: 'fallback',
            window: fallbackWindow,
            label: formatRateLimitWindowChipLabel(fallbackWindow)
          }
        ]
      : []
  }

  const windowChips: (VerboseUsageChip | null)[] = [
    p.session
      ? {
          kind: 'window',
          key: 'session',
          window: p.session,
          label: formatRateLimitWindowChipLabel(p.session)
        }
      : null,
    p.weekly
      ? {
          kind: 'window',
          key: 'weekly',
          window: p.weekly,
          label: formatRateLimitWindowChipLabel(p.weekly)
        }
      : null,
    p.fableWeekly
      ? {
          kind: 'window',
          key: 'fableWeekly',
          window: p.fableWeekly,
          label: translate('auto.components.status.bar.StatusBar.a79c64f87e', 'Fable')
        }
      : null,
    // Why: monthly stays inline for monthly-only providers; otherwise the detail panel carries it.
    p.monthly && !p.session && !p.weekly
      ? {
          kind: 'window',
          key: 'monthly',
          window: p.monthly,
          label: formatRateLimitWindowChipLabel(p.monthly)
        }
      : null
  ]
  return windowChips.filter((chip): chip is VerboseUsageChip => chip !== null)
}

// Why: the verbose mini bar sits directly left of the first chip, so it must track
// that chip's window. #11376 folded verbose onto the compact bar, which is fed by
// the *tightest* window — right there, where the tightest window is the only chip
// rendered, but in verbose mode it left a freshly reset "1% used" session sitting
// next to a bar still filled to the untouched weekly window.
export function getVerboseLeadUsedPercent(p: ProviderRateLimits): number | null {
  const [lead] = getVerboseUsageChips(p)
  if (!lead) {
    return null
  }
  return lead.kind === 'bucket' ? lead.usedPercent : lead.window.usedPercent
}

function VerboseProviderUsage({
  p,
  display
}: {
  p: ProviderRateLimits
  display: UsagePercentageDisplay
}): React.JSX.Element {
  return (
    <>
      {getVerboseUsageChips(p).map((chip, index) => (
        <React.Fragment key={chip.key}>
          {index > 0 ? <span className="text-muted-foreground">·</span> : null}
          {chip.kind === 'bucket' ? (
            <span className="tabular-nums">
              {chip.name} {formatUsagePercentageLabel(chip.usedPercent, display)}
            </span>
          ) : (
            <WindowLabel w={chip.window} label={chip.label} display={display} />
          )}
        </React.Fragment>
      ))}
    </>
  )
}

export function ProviderSegment({
  p,
  compact,
  display,
  mode = 'verbose'
}: {
  p: ProviderRateLimits | null
  compact: boolean
  display: UsagePercentageDisplay
  mode?: StatusBarUsageMode
}): React.JSX.Element {
  const provider = p?.provider ?? 'claude'
  const statusLabel = p ? getProviderUsageStatusLabel(p) : ''

  // Idle / initial load
  if (!p || p.status === 'idle') {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <ProviderIcon provider={provider} />
        <span className="animate-pulse">···</span>
      </span>
    )
  }

  const tightest = getTightestUsageSection(p)

  // Fetching with no prior data
  if (p.status === 'fetching' && !tightest) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <ProviderIcon provider={provider} />
        <span className="animate-pulse">···</span>
      </span>
    )
  }

  // Unavailable (CLI not installed)
  if (p.status === 'unavailable') {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground/50">
        <ProviderIcon provider={provider} /> --
      </span>
    )
  }

  // Error with no data
  if (p.status === 'error' && !tightest) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <ProviderIcon provider={provider} />
        <AlertTriangle size={11} className="text-muted-foreground/80" />
        {!compact && <span className="text-[11px] font-medium">{statusLabel}</span>}
      </span>
    )
  }

  // Has data (ok, fetching with stale data, or error with stale data)
  const isStale = p.status === 'error'
  const verboseLeadUsedPercent = getVerboseLeadUsedPercent(p)

  return (
    <span className="inline-flex items-center gap-1.5">
      <ProviderIcon provider={provider} />
      {mode === 'verbose' ? (
        <>
          {verboseLeadUsedPercent !== null && !compact ? (
            <MiniBar usedPct={clampUsedPercent(verboseLeadUsedPercent)} display={display} />
          ) : null}
          <VerboseProviderUsage p={p} display={display} />
        </>
      ) : tightest ? (
        <WindowLabel
          w={tightest.window}
          label={tightest.label}
          display={display}
          showLabel={!compact}
        />
      ) : null}
      {isStale && <AlertTriangle size={11} className="text-muted-foreground/80" />}
    </span>
  )
}
