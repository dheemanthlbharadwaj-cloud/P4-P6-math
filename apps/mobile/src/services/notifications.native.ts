// Local notifications on Android and iOS (expo-notifications). Never imported on web (see notifications.ts).
// Two kinds, both one-off notifications at a date (no repeating trigger):
//   "hearts-full"          at the next local midnight, while hearts are below the maximum and not subscribed;
//   "practice-YYYY-MM-DD"  at the kid's chosen time on each of the next 7 days, today skipped once practised.
// replanNotifications() recomputes the whole plan from local data and makes the OS match it; it is cheap and idempotent.
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { MAX_HEARTS } from "@p6/shared";
import {
  CHANNEL_ID, HEARTS_FULL_ID, HEARTS_FULL_MESSAGE, heartsFullTime, practiceMessage, practiceReminders,
  PRACTICE_ID_PREFIX, practisedToday,
} from "../logic/notifications";
import { computeMeters, usePlayer } from "../store/player";
import { useProfile } from "../store/profile";
import { useNotifications } from "../store/notifications";

export type PermState = "granted" | "denied" | "undetermined";
export interface ScheduledInfo { id: string; title: string; at: number | null }

export const notificationsSupported = true;

const isOurs = (id: string) => id === HEARTS_FULL_ID || id.startsWith(PRACTICE_ID_PREFIX);

async function ensureChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function getPermission(): Promise<PermState> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return "granted";
    return p.status === "undetermined" ? "undetermined" : "denied";
  } catch { return "denied"; }
}

/** Asks the system (Android 13+: POST_NOTIFICATIONS dialog; the channel must exist first). Only call after a kid's action. */
export async function requestPermission(): Promise<PermState> {
  try {
    await ensureChannel();
    const p = await Notifications.requestPermissionsAsync();
    const state: PermState = p.granted ? "granted" : p.status === "undetermined" ? "undetermined" : "denied";
    void replanNotifications();
    return state;
  } catch { return "denied"; }
}

export async function cancelOurNotifications(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(all.filter((n) => isOurs(n.identifier)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  } catch { /* nothing scheduled / module unavailable */ }
}

async function plan() {
  const now = Date.now();
  const profile = useProfile.getState();
  // Signed out or not set up yet: nothing is scheduled for anybody.
  if (!profile.uid || !profile.onboarded) return cancelOurNotifications();
  if ((await getPermission()) !== "granted") return cancelOurNotifications();
  await ensureChannel();

  const s = useNotifications.getState();
  const player = usePlayer.getState();
  const want = new Map<string, { at: number; title: string; body: string }>();

  const hearts = computeMeters(player, now).hearts;
  const fullAt = heartsFullTime({ enabled: s.heartsFullEnabled, hearts, max: MAX_HEARTS, subscribed: player.subscribed, now });
  if (fullAt !== null) want.set(HEARTS_FULL_ID, { at: fullAt, ...HEARTS_FULL_MESSAGE });

  if (s.practiceEnabled) {
    for (const r of practiceReminders({ now, minutes: s.practiceMinutes, practisedToday: practisedToday(s.lastPracticeDay, now) })) {
      want.set(r.id, { at: r.at, ...practiceMessage(r.at, profile.catName) });
    }
  }

  // Drop what is no longer wanted (hearts full, subscribed, practised today, switched off, old days)...
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of existing) if (isOurs(n.identifier) && !want.has(n.identifier)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  // ...and (re)schedule the rest. The same identifier replaces the old one, so there is never more than one of each.
  for (const [identifier, w] of want) {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title: w.title, body: w.body, sound: false },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: w.at, channelId: CHANNEL_ID },
    });
  }
}

let chain: Promise<void> = Promise.resolve();
/** Make the scheduled notifications match the current settings, hearts, subscription and today's practice (queued, never concurrent). */
export function replanNotifications(): Promise<void> {
  chain = chain.then(plan).catch((e) => { console.warn("Notification planning failed", e); });
  return chain;
}

// Only what the plan depends on: other store writes (stars, progress...) do not trigger a re-plan.
const signature = () => {
  const n = useNotifications.getState();
  const p = usePlayer.getState();
  const pr = useProfile.getState();
  return JSON.stringify([p.hearts.value, p.subscribed, n.practiceEnabled, n.practiceMinutes, n.heartsFullEnabled, n.lastPracticeDay, pr.catName, pr.uid, pr.onboarded]);
};
let lastSignature = "";
let timer: ReturnType<typeof setTimeout> | null = null;
function replanSoon() {
  const sig = signature();
  if (sig === lastSignature) return;
  lastSignature = sig;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void replanNotifications(); }, 400);
}

/**
 * Start once the student is signed in and set up: shows notifications while the app is open, plans now, and re-plans on
 * foreground and whenever hearts, subscription, settings, cat name or today's practice change. `onOpen` runs when a
 * notification is tapped. Returns the cleanup.
 */
export function startNotifications(onOpen: () => void): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  void ensureChannel().catch(() => {});
  lastSignature = signature();
  void replanNotifications();
  const app = AppState.addEventListener("change", (st) => { if (st === "active") void replanNotifications(); });
  const tap = Notifications.addNotificationResponseReceivedListener(() => onOpen());
  const unsubs = [usePlayer.subscribe(replanSoon), useNotifications.subscribe(replanSoon), useProfile.subscribe(replanSoon)];
  return () => { app.remove(); tap.remove(); unsubs.forEach((u) => u()); if (timer) { clearTimeout(timer); timer = null; } };
}

/** Hearts hit zero: the first time ever, ask for permission (hearts-full is on by default). Later it never asks again by itself. */
export async function onHeartsRanOut(): Promise<void> {
  const s = useNotifications.getState();
  if (s.askedWhenHeartsOut || !s.heartsFullEnabled) return;
  s.set({ askedWhenHeartsOut: true });
  if ((await getPermission()) === "undetermined") await requestPermission();
  else void replanNotifications();
}

// --- Dev Tools helpers ---
export async function sendTestNotification(): Promise<string> {
  if ((await getPermission()) !== "granted" && (await requestPermission()) !== "granted") return "Notifications are off for this app. Turn them on in the phone's Settings.";
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: "dev-test",
    content: { title: "Test notification", body: "It works! Tap me to open the map.", sound: false },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 10, channelId: CHANNEL_ID },
  });
  return "Test notification in 10 s. Put the app in the background to see it.";
}

export async function listScheduled(): Promise<ScheduledInfo[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const out = all.map((n) => {
    const t = n.trigger as unknown as { value?: number; date?: number; seconds?: number } | null;
    const raw = t?.value ?? t?.date ?? null;
    return { id: n.identifier, title: n.content.title ?? "", at: typeof raw === "number" ? raw : null };
  });
  return out.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
}
