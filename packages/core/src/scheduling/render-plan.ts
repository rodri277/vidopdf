export interface RenderPlanInput<K> {
  /** What the screen needs now, most urgent first (visible pages ordered by closeness to the viewport). */
  readonly wanted: readonly K[];
  readonly inFlight: ReadonlySet<K>;
  readonly cached: (key: K) => boolean;
  readonly maxInFlight: number;
}

export interface RenderPlan<K> {
  /** In-flight renders nobody wants any more (the user scrolled away). */
  readonly cancel: readonly K[];
  /** Renders to begin now, in priority order. */
  readonly start: readonly K[];
}

/**
 * Decides which thumbnail renders to cancel and which to start, given what is wanted, what is
 * already running and what is already cached. Pure, so the policy is tested without a browser.
 */
export function planRenders<K>(input: RenderPlanInput<K>): RenderPlan<K> {
  const wanted = new Set(input.wanted);
  const cancel = [...input.inFlight].filter((key) => !wanted.has(key));
  const running = input.inFlight.size - cancel.length;
  const room = Math.max(0, input.maxInFlight - running);
  const start: K[] = [];
  for (const key of input.wanted) {
    if (start.length >= room) break;
    if (!input.inFlight.has(key) && !input.cached(key) && !start.includes(key)) start.push(key);
  }
  return { cancel, start };
}
