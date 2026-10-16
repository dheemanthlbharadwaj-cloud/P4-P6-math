import { describe, expect, it } from "vitest";
import {
  dayKey, formatSlot, heartsFullTime, nextLocalMidnight, PRACTICE_MESSAGES, practiceMessage, practiceReminders,
  practisedToday, snapSlot, stepSlot, timeSlots,
} from "./notifications";

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

describe("time slots", () => {
  it("every 30 minutes from 7:00 am to 9:30 pm", () => {
    const s = timeSlots();
    expect(s[0]).toBe(420);
    expect(s[s.length - 1]).toBe(21 * 60 + 30);
    expect(s.length).toBe(30);
  });
  it("snaps and steps inside the list", () => {
    expect(snapSlot(0)).toBe(420);
    expect(snapSlot(24 * 60)).toBe(21 * 60 + 30);
    expect(snapSlot(17 * 60 + 10)).toBe(17 * 60);
    expect(snapSlot(NaN)).toBe(17 * 60);
    expect(stepSlot(17 * 60, 1)).toBe(17 * 60 + 30);
    expect(stepSlot(420, -1)).toBe(420);
    expect(stepSlot(21 * 60 + 30, 1)).toBe(21 * 60 + 30);
  });
  it("formats am/pm", () => {
    expect(formatSlot(420)).toBe("7:00 am");
    expect(formatSlot(12 * 60)).toBe("12:00 pm");
    expect(formatSlot(12 * 60 + 30)).toBe("12:30 pm");
    expect(formatSlot(17 * 60)).toBe("5:00 pm");
    expect(formatSlot(21 * 60 + 30)).toBe("9:30 pm");
  });
});

describe("next midnight and hearts-full", () => {
  it("is the next local midnight", () => {
    expect(nextLocalMidnight(at(2026, 10, 16, 15, 20))).toBe(at(2026, 10, 17));
    expect(nextLocalMidnight(at(2026, 10, 16, 0, 0))).toBe(at(2026, 10, 17));
    expect(nextLocalMidnight(at(2026, 12, 31, 23, 59))).toBe(at(2027, 1, 1));
  });
  const base = { enabled: true, hearts: 4, max: 10, subscribed: false, now: at(2026, 10, 16, 15) };
  it("schedules when hearts are missing", () => expect(heartsFullTime(base)).toBe(at(2026, 10, 17)));
  it("not when full, subscribed or switched off", () => {
    expect(heartsFullTime({ ...base, hearts: 10 })).toBeNull();
    expect(heartsFullTime({ ...base, subscribed: true })).toBeNull();
    expect(heartsFullTime({ ...base, enabled: false })).toBeNull();
  });
});

describe("practice reminders", () => {
  const now = at(2026, 10, 16, 15, 0); // 3 pm
  it("7 days from today when the time is still ahead", () => {
    const r = practiceReminders({ now, minutes: 17 * 60, practisedToday: false });
    expect(r).toHaveLength(7);
    expect(r[0]).toEqual({ id: "practice-2026-10-16", at: at(2026, 10, 16, 17) });
    expect(r[6].id).toBe("practice-2026-10-22");
  });
  it("skips today when already practised", () => {
    const r = practiceReminders({ now, minutes: 17 * 60, practisedToday: true });
    expect(r).toHaveLength(7);
    expect(r[0].id).toBe("practice-2026-10-17");
    expect(r[6].id).toBe("practice-2026-10-23");
  });
  it("skips today when the time has passed", () => {
    const r = practiceReminders({ now, minutes: 7 * 60, practisedToday: false });
    expect(r).toHaveLength(7);
    expect(r[0].id).toBe("practice-2026-10-17");
  });
  it("skips a time less than 30 s ahead", () => {
    const r = practiceReminders({ now: at(2026, 10, 16, 16, 59) + 40_000, minutes: 17 * 60, practisedToday: false });
    expect(r[0].id).toBe("practice-2026-10-17");
  });
  it("crosses month and year ends", () => {
    const r = practiceReminders({ now: at(2026, 12, 29, 20), minutes: 7 * 60, practisedToday: false });
    expect(r.map((x) => x.id)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03", "2027-01-04", "2027-01-05"].map((d) => `practice-${d}`));
  });
  it("ids are unique and sorted", () => {
    const r = practiceReminders({ now, minutes: 8 * 60 + 30, practisedToday: false });
    expect(new Set(r.map((x) => x.id)).size).toBe(r.length);
    expect(r.map((x) => x.at)).toEqual([...r.map((x) => x.at)].sort((a, b) => a - b));
  });
});

describe("practised today / messages", () => {
  it("compares local days", () => {
    expect(practisedToday(dayKey(at(2026, 10, 16, 9)), at(2026, 10, 16, 23))).toBe(true);
    expect(practisedToday(dayKey(at(2026, 10, 15, 23)), at(2026, 10, 16, 0, 5))).toBe(false);
    expect(practisedToday("", at(2026, 10, 16))).toBe(false);
  });
  it("rotates across days, stable for one day, uses the cat name", () => {
    const lines = new Set<string>();
    for (let d = 1; d <= 14; d++) lines.add(practiceMessage(at(2026, 10, d, 17), "Mochi").title + practiceMessage(at(2026, 10, d, 17), "Mochi").body);
    expect(lines.size).toBe(PRACTICE_MESSAGES.length);
    expect(practiceMessage(at(2026, 10, 3, 17), "Mochi")).toEqual(practiceMessage(at(2026, 10, 3, 8), "Mochi"));
    const joined = PRACTICE_MESSAGES.map((_, i) => practiceMessage(at(2026, 10, 1 + i, 17), "Mochi")).map((m) => m.title + m.body).join(" ");
    expect(joined).toContain("Mochi");
    expect(joined).not.toContain("{cat}");
  });
  it("falls back to a generic name", () => {
    const all = PRACTICE_MESSAGES.map((_, i) => practiceMessage(at(2026, 10, 1 + i, 17), "  ")).map((m) => m.title + m.body).join(" ");
    expect(all).toContain("Your cat")
    expect(all).toContain("with your cat")
    expect(all).not.toMatch(/\{|\}/);
  });
});
