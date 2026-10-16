// Web build of the notifications service: the web app has no local notifications, and this file keeps
// expo-notifications out of the web bundle. Metro picks notifications.native.ts on Android and iOS instead.
// Keep both files exporting the same API.

export type PermState = "granted" | "denied" | "undetermined";
export interface ScheduledInfo { id: string; title: string; at: number | null }

/** False on web: the Reminders card is hidden there. */
export const notificationsSupported = false;

export async function getPermission(): Promise<PermState> { return "denied"; }
export async function requestPermission(): Promise<PermState> { return "denied"; }
export function replanNotifications(): Promise<void> { return Promise.resolve(); }
export function startNotifications(_onOpen: () => void): () => void { return () => {}; }
export async function cancelOurNotifications(): Promise<void> {}
/** Called when the player's hearts hit zero. */
export async function onHeartsRanOut(): Promise<void> {}
export async function sendTestNotification(): Promise<string> { return "Notifications are not available on the web."; }
export async function listScheduled(): Promise<ScheduledInfo[]> { return []; }
