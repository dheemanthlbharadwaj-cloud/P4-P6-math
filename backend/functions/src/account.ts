import type { AccountState, CatLook, UserProfile } from "./shared/index.js";
import { col, db, entriesRef, monthlyBoard } from "./admin.js";
import { sgtMonth } from "./logic/dates.js";
import { isSubscribed } from "./logic/revenuecat.js";

const DEFAULT_LOOK: CatLook = { colorId: "color-black", hatId: null };

/** Everything the app needs to (re)build its local state for this account. Server-owned data only. */
export async function loadAccountState(uid: string, profile: Pick<UserProfile, "cat"> | null, now = Date.now()): Promise<AccountState> {
  const [wallet, ent, month] = await db.getAll(
    db.collection(col.wallets).doc(uid),
    db.collection(col.entitlements).doc(uid),
    entriesRef(monthlyBoard(sgtMonth(now))).doc(uid),
  );
  const inventory = (wallet.data()?.inventory as string[] | undefined) ?? ["color-black"];
  return {
    starBalance: (wallet.data()?.starBalance as number | undefined) ?? 0,
    monthlyStars: (month.data()?.stars as number | undefined) ?? 0,
    totalStars: (wallet.data()?.totalStars as number | undefined) ?? 0,
    claimedQuests: (wallet.data()?.claimedQuests as string[] | undefined) ?? [],
    ownedItems: inventory.includes("color-black") ? inventory : ["color-black", ...inventory],
    equipped: profile ? { colorId: profile.cat.colorId, hatId: profile.cat.hatId ?? null } : DEFAULT_LOOK,
    subscribed: isSubscribed(ent.data(), now),
  };
}
