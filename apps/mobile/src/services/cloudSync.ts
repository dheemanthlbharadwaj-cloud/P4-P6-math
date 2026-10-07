// Device <-> server sync, all through the backend API (the app never touches Firestore directly, so it does not
// depend on the security rules of the database it shares with the question bank editor):
//   updateProfile   profile fields + equipped cat look (the server checks the items are owned)
//   syncProgress    levels + unlocked topics (merged by max on the server) and "previously wrong" bookmarks
// Stars, inventory and entitlements are server-only and come back through bootstrapProfile.
// Everything here is best-effort: failures are swallowed and retried by the next sync.
import { MAX_SYNC_WRONG, type Grade } from "@p6/shared";
import { api } from "./api";
import { currentUser } from "./auth";
import { isFirebaseConfigured } from "./config";
import { emptyGradeProgress } from "../logic/unlock";
import { wrongDocsToPush, type WrongDoc } from "../logic/wrongSync";
import { useCosmetics } from "../store/cosmetics";
import { useProfile } from "../store/profile";
import { useProgress } from "../store/progress";
import { useWrong } from "../store/wrong";

const uidNow = () => (isFirebaseConfigured ? currentUser()?.uid ?? null : null);
const syncedWrong = new Map<string, boolean>(); // questionId → active, as last known on the server
const lastProgressJson = new Map<string, string>();

/** Push the editable profile + equipped look (the server skips a look the account doesn't own and saves the rest). */
export async function pushProfile(): Promise<void> {
  const uid = uidNow();
  const p = useProfile.getState();
  if (!uid || !p.onboarded || !p.fullName.trim()) return;
  const look = useCosmetics.getState().look();
  await api.updateProfile({
    fullName: p.fullName.trim().slice(0, 60), school: p.school.trim().slice(0, 80), topicsLearnt: p.topicsLearnt, psleDate: p.psleDate,
    cat: { name: (p.catName || "Mochi").slice(0, 20), colorId: look.colorId, hatId: look.hatId },
  }).catch(() => undefined); // not signed in yet / offline / profile missing: next sync
}

async function pushProgress(grade: Grade): Promise<void> {
  const uid = uidNow();
  const local = useProgress.getState().grades[grade];
  if (!uid || !local) return;
  const json = JSON.stringify(local);
  if (lastProgressJson.get(grade) === json) return;
  await api.syncProgress({ grade, progress: { unlockedTopics: local.unlockedTopics, levels: local.levels } });
  lastProgressJson.set(grade, json);
}

async function pushWrong(grade: Grade): Promise<void> {
  const uid = uidNow();
  if (!uid) return;
  const w = useWrong.getState();
  const docs = wrongDocsToPush({ byGrade: w.byGrade, history: w.history }, grade, syncedWrong).filter((d) => !d.id.includes("/"));
  for (let i = 0; i < docs.length; i += MAX_SYNC_WRONG) {
    const chunk = docs.slice(i, i + MAX_SYNC_WRONG);
    await api.syncProgress({ grade, wrong: chunk });
    for (const d of chunk) syncedWrong.set(d.id, d.active);
  }
}

/** Push everything that changed (progress for each grade held locally + wrong bookmarks). */
export async function pushAll(): Promise<void> {
  try {
    const grades = Object.keys(useProgress.getState().grades) as Grade[];
    for (const g of grades) { await pushProgress(g); await pushWrong(g); }
  } catch { /* offline or signed out: retried on the next change / launch */ }
}

/** Read the server copy of a grade's progress + bookmarks and merge it into the local stores (by max / union). */
export async function pullAndMerge(grade: Grade): Promise<boolean> {
  const uid = uidNow();
  if (!uid) return false;
  try {
    const res = await api.syncProgress({ grade, pull: true });
    useProgress.getState().ensureGrade(grade, useProfile.getState().topicsLearnt);
    if (res.progress) {
      useProgress.getState().mergeRemote(grade, { ...emptyGradeProgress(grade), unlockedTopics: res.progress.unlockedTopics ?? [], levels: res.progress.levels ?? {} });
    }
    const docs: WrongDoc[] = res.wrong ?? [];
    useWrong.getState().mergeRemote(grade, docs);
    for (const d of docs) syncedWrong.set(d.id, d.active);
    return true;
  } catch {
    return false;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
let unsubs: (() => void)[] = [];

/** Push (debounced) whenever progress or bookmarks change. Safe to call repeatedly. */
export function startCloudSync(): void {
  if (unsubs.length) return;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => void pushAll(), 5000); };
  unsubs = [useProgress.subscribe(schedule), useWrong.subscribe(schedule)];
  schedule();
}

/** Stop pushing (sign-out / account deletion) and forget what was synced for the previous account. */
export function stopCloudSync(): void {
  clearTimeout(timer);
  unsubs.forEach((u) => u());
  unsubs = [];
  syncedWrong.clear();
  lastProgressJson.clear();
}
