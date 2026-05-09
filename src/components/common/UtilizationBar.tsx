import { usageColor } from '../../engines/export/pptx/primitives/colors'
import { THEME } from '../../engines/export/pptx/theme'

export interface UtilizationBarProps {
  /** 0..1 mean ratio. Values outside [0, 1] are clamped before rendering. */
  ratio: number
  /** Optional 0..1 peak position. Renders a thin gold tick when > 0. */
  peak?: number
  /** Visual height of the track in pixels. Default 8 (matches `.util-bar-track`). */
  heightPx?: number
  /** Tailwind class hook for the container. */
  className?: string
  /** Aria description; the component reads as "X percent utilization, peak Y percent". */
  label?: string
}

const clamp01 = (n: number): number => Math.max(0, Math.min(n, 1))

/**
 * Horizontal utilization bar — track + status fill + optional peak marker.
 * Mirrors the PPTX `drawProgressBar` visual contract so the dashboard and
 * the deck render the same shape (ADR-0006).
 *
 * Status color follows ADR-0003 (green < 40 % · orange < 70 % · red ≥ 70 %).
 * Empty / non-finite inputs render the empty track only.
 */
export function UtilizationBar({
  ratio,
  peak,
  heightPx = 8,
  className,
  label,
}: UtilizationBarProps) {
  const safeRatio = Number.isFinite(ratio) ? clamp01(ratio) : 0
  const safePeak = peak !== undefined && Number.isFinite(peak) ? clamp01(peak) : null
  const fillColor = `#${usageColor(ratio)}`
  const trackColor = `#${THEME.ice}`
  const peakColor = `#${THEME.gold}`

  return (
    <div
      className={`relative w-full overflow-hidden rounded-full ${className ?? ''}`}
      role="img"
      aria-label={label}
      style={{ height: `${heightPx}px`, background: trackColor }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-200"
        style={{ width: `${safeRatio * 100}%`, background: fillColor }}
      />
      {safePeak !== null && safePeak > 0 ? (
        <div
          aria-hidden
          className="absolute top-[-2px] bottom-[-2px] w-[3px]"
          style={{ left: `calc(${safePeak * 100}% - 1.5px)`, background: peakColor }}
        />
      ) : null}
    </div>
  )
}
