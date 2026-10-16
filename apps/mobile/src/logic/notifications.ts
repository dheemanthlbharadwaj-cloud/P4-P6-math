// Local notifications: pure rules (no I/O, `now` always injected). Platform glue is in services/notifications.native.ts.
// Times are local Date math (device time zone).

export const HEARTS_FULL_ID = "hearts-full";
export const PRACTICE_ID_PREFIX = "practice-";
export const CHANNEL_ID = "reminders";
/** Reminders are planned for the next 7 days, one notification per day (never one repeating trigger). */
export const PRACTICE_DAYS = 7;
/** A time less than this far ahead is not scheduled (it would fire while we plan). */
export const MIN_LEAD_MS = 30_000;

/** Time slots the kid can pick: every 30 minutes from 7:00 am to 9:30 pm, as minutes after midnight. */
export const FIRST_SLOT = 7 * 60;
export const LAST_SLOT = 21 * 60 + 30;
export const SLOT_STEP = 30;
export const DEFAULT_PRACTICE_MINUTES = 17 * 60; // 5:00 pm

export function timeSlots(): number[] {
  const out: number[] = [];
  for (let m = FIRST_SLOT; m <= LAST_SLOT; m += SLOT_STEP) out.push(m);
  return out;
}

/** Nearest allowed slot (bad or old stored values land inside the list). */
export function snapSlot(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_PRACTICE_MINUTES;
  const clamped = Math.min(LAST_SLOT, Math.max(FIRST_SLOT, minutes));
  return FIRST_SLOT + Math.round((clamped - FIRST_SLOT) / SLOT_STEP) * SLOT_STEP;
}

/** One step earlier (-1) or later (+1), stopping at the ends of the list. */
export function stepSlot(minutes: number, dir: -1 | 1): number {
  return snapSlot(snapSlot(minutes) + dir * SLOT_STEP);
}

/** "5:00 pm", "7:30 am", "12:00 pm". */
export function formatSlot(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** Local calendar day, e.g. "2026-10-04" (same format as logic/daily.ts localDay). */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The next local midnight strictly after `now` (ms epoch). */
export function nextLocalMidnight(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
}

export interface HeartsFullInput {
  enabled: boolean;
  hearts: number; // as of `now` (already refilled if a midnight passed)
  max: number;
  subscribed: boolean;
  now: number;
}

/** When to tell the kid the hearts are full again: the next local midnight; null when nothing should be scheduled. */
export function heartsFullTime(i: HeartsFullInput): number | null {
  if (!i.enabled || i.subscribed || i.hearts >= i.max) return null;
  return nextLocalMidnight(i.now);
}

export interface PracticeInput {
  now: number;
  minutes: number; // chosen time, minutes after local midnight
  practisedToday: boolean;
  days?: number;
}

export interface PlannedReminder {
  id: string; // practice-YYYY-MM-DD
  at: number; // ms epoch
}

/**
 * Practice reminders: one per day at the chosen local time, for the next `days` (7) days that are still ahead.
 * Today is skipped when the kid has already practised (answered a question) today, or when the time has passed.
 */
export function practiceReminders(i: PracticeInput): PlannedReminder[] {
  const slot = snapSlot(i.minutes);
  const h = Math.floor(slot / 60);
  const m = slot % 60;
  const base = new Date(i.now);
  const out: PlannedReminder[] = [];
  for (let k = 0; k <= (i.days ?? PRACTICE_DAYS) && out.length < (i.days ?? PRACTICE_DAYS); k++) {
    if (k === 0 && i.practisedToday) continue;
    const at = new Date(base.getFullYear(), base.getMonth(), base.getDate() + k, h, m, 0, 0).getTime();
    if (at < i.now + MIN_LEAD_MS) continue;
    out.push({ id: `${PRACTICE_ID_PREFIX}${dayKey(at)}`, at });
  }
  return out;
}

/** Has the kid answered a question on the local day of `now`? `lastPracticeDay` is a dayKey or "". */
export function practisedToday(lastPracticeDay: string, now: number): boolean {
  return lastPracticeDay === dayKey(now);
}

// Short, friendly, no guilt-tripping. {cat}/{Cat} = the player's cat name (or "your cat").
export const PRACTICE_MESSAGES: { title: string; body: string }[] = [
  { title: "{Cat} is waiting at the board!", body: "5 minutes of maths?" },
  { title: "Ready for a little maths?", body: "{cat} has a fun question for you." },
  { title: "Time to climb the map!", body: "Pick up a level with {cat}." },
  { title: "Meow! Maths time!", body: "A few questions and you could earn a star." },
  { title: "{Cat} saved you a seat.", body: "Come and try a level today." },
  { title: "Stretch your brain!", body: "Two minutes with {cat} is a great start." },
  { title: "A star is waiting for you!", body: "Open the map and have a go." },
];


function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** The message for a given reminder day: rotates through the list, the same day always gives the same line. */
export function practiceMessage(at: number, catName: string): { title: string; body: string } {
  const days = Math.floor(Date.UTC(new Date(at).getFullYear(), new Date(at).getMonth(), new Date(at).getDate()) / 86_400_000);
  const m = PRACTICE_MESSAGES[(days + hash("p6")) % PRACTICE_MESSAGES.length];
  const n = catName.trim();
  // {Cat} starts a sentence, {cat} sits inside one.
  const fill = (t: string) => t.replace(/\{Cat\}/g, n || "Your cat").replace(/\{cat\}/g, n || "your cat");
  return { title: fill(m.title), body: fill(m.body) };
}

export const HEARTS_FULL_MESSAGE = {
  title: "Your hearts are full again! ❤️",
  body: "Come back and keep climbing the map with your cat.",
};
