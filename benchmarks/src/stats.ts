/** Small statistics for benchmark samples. */

export function percentile(samples: readonly number[], fraction: number): number {
  if (samples.length === 0) return Number.NaN;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index] ?? Number.NaN;
}

export function median(samples: readonly number[]): number {
  return percentile(samples, 0.5);
}

export function mean(samples: readonly number[]): number {
  return samples.length === 0
    ? Number.NaN
    : samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

export interface FrameStats {
  readonly frames: number;
  /** Frames per second over the whole run. */
  readonly fps: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly worstMs: number;
  /** Frames that took more than 20 ms (a missed 60 Hz frame plus slack). */
  readonly slowFrames: number;
}

/** What the frame deltas of a run (milliseconds between animation frames) say about smoothness. */
export function frameStats(deltas: readonly number[]): FrameStats {
  const total = deltas.reduce((sum, value) => sum + value, 0);
  return {
    frames: deltas.length,
    fps: total === 0 ? 0 : (deltas.length / total) * 1000,
    medianMs: median(deltas),
    p95Ms: percentile(deltas, 0.95),
    p99Ms: percentile(deltas, 0.99),
    worstMs: deltas.length === 0 ? Number.NaN : Math.max(...deltas),
    slowFrames: deltas.filter((delta) => delta > 20).length,
  };
}

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
