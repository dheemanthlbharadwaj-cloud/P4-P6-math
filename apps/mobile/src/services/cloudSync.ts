// Device <-> Firestore sync of the data the owner is allowed to write (see backend/firestore.rules):
//   users/{uid}                    profile fields + equipped cat look (rules verify the item is in wallets/{uid}.inventory)
//   users/{uid}/progress/{grade}   levels + unlocked topics, merged by max
//   users/{uid}/wrong/{questionId} "previously wrong" bookmarks
// Stars, inventory and entitlements are server-only and come back through bootstrapProfile.
// Everything here is best-effort: failures are swallowed and retried by the next sync.
import { collection, doc, getDoc, getDocs, runTransaction, updateDoc, writeBatch } from "firebase/firestore";
import type { Grade, GradeProgress } from "@p6/shared";
import { firebaseFirestore } from "./firebase";
import { currentUser } from "./auth";
import { isFirebaseConfigured } from "./config";
import { emptyGradeProgress, mergeGradeProgress } from "../logic/unlock";
import { wrongDocsToPush, type WrongDoc } from "../logic/wrongSync";
import { useCosmetics } from "../store/cosmetics";
import { useProfile } from "../store/profile";
import { useProgress } from "../store/progress";
import { useWrong } from "../store/wrong";

const uidNow = () => (isFirebaseConfigured ? currentUser()?.uid ?? null : null);
const syncedWrong = new Map<string, boolean>(); // questionId → active, as last known on the server
const lastProgressJson = new Map<string, string>();

/** Push the editable profile + equipped look. Retries without the look if the rules refuse it (e.g. unowned item). */
export async function pushProfile(): Promise<void> {
  const uid = uidNow();
  const p = useProfile.getState();
  if (!uid || !p.onboarded || !p.fullName.trim()) return;
  const look = useCosmetics.getState().look();
  const base = { fullName: p.fullName.trim().slice(0, 60), school: p.school.trim().slice(0, 80), topicsLearnt: p.topicsLearnt, psleDate: p.psleDate };
  const ref = doc(firebaseFirestore(), "users", uid);
  try {
    await updateDoc(ref, { ...base, cat: { name: (p.catName || "Mochi").slice(0, 20), colorId: look.colorId, hatId: look.hatId } });
  } catch (e) {
    if ((e as { code?: string })?.code !== "permission-denied") return;
    try { await updateDoc(ref, base); } catch { /* not signed in yet / profile missing: next sync */ }
  }
}

async function pushProgress(grade: Grade): Promise<void> {
  const uid = uidNow();
  const local = useProgress.getState().grades[grade];
  if (!uid || !local) return;
  const json = JSON.stringify(local);
  if (lastProgressJson.get(grade) === json) return;
  const db = firebaseFirestore();
  const ref = doc(db, "users", uid, "progress", grade);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const merged = mergeGradeProgress(local, snap.exists() ? (snap.data() as GradeProgress) : undefined);
    tx.set(ref, { grade, unlockedTopics: merged.unlockedTopics, levels: merged.levels, updatedAt: Date.now() });
  });
  lastProgressJson.set(grade, json);
}

async function pushWrong(grade: Grade): Promise<void> {
  const uid = uidNow();
  if (!uid) return;
  const w = useWrong.getState();
  const docs = wrongDocsToPush({ byGrade: w.byGrade, history: w.history }, grade, syncedWrong).filter((d) => !d.id.includes("/"));
  const db = firebaseFirestore();
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + 400);
    for (const d of chunk) batch.set(doc(db, "users", uid, "wrong", d.id), { grade, active: d.active, flaggedAt: d.flaggedAt, updatedAt: Date.now() });
    await batch.commit();
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
    const db = firebaseFirestore();
    const [progress, wrong] = await Promise.all([
      getDoc(doc(db, "users", uid, "progress", grade)),
      getDocs(collection(db, "users", uid, "wrong")),
    ]);
    useProgress.getState().ensureGrade(grade, useProfile.getState().topicsLearnt);
    if (progress.exists()) {
      const d = progress.data() as Partial<GradeProgress>;
      useProgress.getState().mergeRemote(grade, { ...emptyGradeProgress(grade), unlockedTopics: d.unlockedTopics ?? [], levels: d.levels ?? {} });
    }
    const docs: WrongDoc[] = wrong.docs
      .filter((s) => (s.data().grade ?? grade) === grade)
      .map((s) => ({ id: s.id, active: s.data().active !== false, flaggedAt: Number(s.data().flaggedAt ?? 0) }));
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
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => void pushAll(), 2500); };
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
