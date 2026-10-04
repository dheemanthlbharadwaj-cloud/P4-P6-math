// Hearts and energy are a daily allowance: full (MAX) at the start of every day, refilled at local midnight.
// Spending lowers it; ads add some back (up to MAX). Pure functions: `now` is always injected.
export interface Meter {
  value: number; // value on the day of `updatedAt`
  updatedAt: number; // ms epoch of the last change
}

/** Local calendar day (device time zone), e.g. "2026-10-04". */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function newMeter(max: number, now: number): Meter {
  return { value: max, updatedAt: now };
}

/** The meter as of `now`: refilled to `max` if a midnight has passed since it last changed. */
export function current(m: Meter, now: number, max: number): Meter {
  if (localDay(m.updatedAt) !== localDay(now) && now > m.updatedAt) return { value: max, updatedAt: now };
  return { value: Math.min(m.value, max), updatedAt: m.updatedAt };
}

/** Spend `n`. Returns null when there is not enough. */
export function spend(m: Meter, n: number, now: number, max: number): Meter | null {
  const cur = current(m, now, max);
  if (cur.value < n) return null;
  return { value: cur.value - n, updatedAt: now };
}

/** Grant `n` (ads), clamped to max. */
export function grant(m: Meter, n: number, now: number, max: number): Meter {
  const cur = current(m, now, max);
  return { value: Math.min(max, cur.value + n), updatedAt: now };
}
