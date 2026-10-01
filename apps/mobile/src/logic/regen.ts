// Time-based regeneration for hearts / energy. Pure functions: `now` is always injected.
export interface Meter {
  value: number; // value as of `updatedAt` (after the last applied regen tick)
  updatedAt: number; // ms epoch of the last applied tick; only meaningful while value < max
}

export interface MeterView {
  meter: Meter;
  /** ms until the next unit is gained; null when full. */
  nextInMs: number | null;
}

export function newMeter(max: number, now: number): Meter {
  return { value: max, updatedAt: now };
}

/** Apply any whole regen periods elapsed since `updatedAt`. */
export function regen(m: Meter, now: number, max: number, periodMs: number): MeterView {
  if (m.value >= max) return { meter: { value: Math.min(m.value, max), updatedAt: now }, nextInMs: null };
  const elapsed = Math.max(0, now - m.updatedAt); // clock moved backwards → no gain
  const gained = Math.floor(elapsed / periodMs);
  const value = Math.min(max, m.value + gained);
  if (value >= max) return { meter: { value: max, updatedAt: now }, nextInMs: null };
  const updatedAt = m.updatedAt + gained * periodMs;
  return { meter: { value, updatedAt }, nextInMs: periodMs - Math.max(0, now - updatedAt) };
}

/** Spend `n` units. Returns null when there is not enough. */
export function spend(m: Meter, n: number, now: number, max: number, periodMs: number): Meter | null {
  const cur = regen(m, now, max, periodMs).meter;
  if (cur.value < n) return null;
  // Spending from a full meter starts the recovery clock now.
  const updatedAt = cur.value >= max ? now : cur.updatedAt;
  return { value: cur.value - n, updatedAt };
}

/** Grant `n` units (ads), clamped to max. */
export function grant(m: Meter, n: number, now: number, max: number, periodMs: number): Meter {
  const cur = regen(m, now, max, periodMs).meter;
  const value = Math.min(max, cur.value + n);
  return { value, updatedAt: value >= max ? now : cur.updatedAt };
}

export function formatCountdown(ms: number | null): string {
  if (ms == null) return "";
  const s = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}
