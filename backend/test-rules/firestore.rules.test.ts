// Run with: npm run test:rules   (needs Java + firebase-tools; starts the Firestore emulator)
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-p6-math",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(async () => env?.cleanup());

const profile = (over: object = {}) => ({
  uid: "alice", fullName: "Alice", school: "Rosyth", grade: "P6", topicsLearnt: [], psleDate: "2026-09-25",
  cat: { name: "Mochi", colorId: "color-black", hatId: null }, friendCode: "ABCD2345", createdAt: 1, ...over,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/alice"), profile());
    await setDoc(doc(db, "users/bob"), profile({ uid: "bob", fullName: "Bob", friendCode: "WXYZ6789" }));
    await setDoc(doc(db, "wallets/alice"), { starBalance: 50, inventory: ["color-black", "hat-cap"] });
    await setDoc(doc(db, "publicProfiles/bob"), { uid: "bob", displayName: "Bob" });
    await setDoc(doc(db, "users/alice/ledger/l1"), { delta: 1 });
    await setDoc(doc(db, "friendships/alice_bob"), { members: ["alice", "bob"] });
    await setDoc(doc(db, "friendships/bob_carol"), { members: ["bob", "carol"] });
    await setDoc(doc(db, "entitlements/alice"), { unlimited: true });
    await setDoc(doc(db, "leaderboards/monthly-2026-10/entries/alice"), { uid: "alice", stars: 3 });
  });
});

const as = (uid: string | null) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

describe("users", () => {
  it("owner can read own profile", () => assertSucceeds(getDoc(doc(as("alice"), "users/alice"))));
  it("others cannot read it", () => assertFails(getDoc(doc(as("bob"), "users/alice"))));
  it("anonymous cannot read it", () => assertFails(getDoc(doc(as(null), "users/alice"))));
  it("client cannot create a profile (bootstrapProfile does)", () => assertFails(setDoc(doc(as("carol"), "users/carol"), profile({ uid: "carol" }))));
  it("owner can edit name/school", () => assertSucceeds(updateDoc(doc(as("alice"), "users/alice"), { fullName: "Alice T", school: "Nanyang" })));
  it("owner cannot change friendCode", () => assertFails(updateDoc(doc(as("alice"), "users/alice"), { friendCode: "HACKED22" })));
  it("owner cannot change createdAt", () => assertFails(updateDoc(doc(as("alice"), "users/alice"), { createdAt: 0 })));
  it("owner cannot delete profile directly", () => assertFails(deleteDoc(doc(as("alice"), "users/alice"))));
  it("can equip an owned hat", () => assertSucceeds(updateDoc(doc(as("alice"), "users/alice"), { cat: { name: "Mochi", colorId: "color-black", hatId: "hat-cap" } })));
  it("cannot equip an unowned hat", () => assertFails(updateDoc(doc(as("alice"), "users/alice"), { cat: { name: "Mochi", colorId: "color-black", hatId: "hat-crown" } })));
  it("cannot equip an unowned colour", () => assertFails(updateDoc(doc(as("alice"), "users/alice"), { cat: { name: "Mochi", colorId: "color-calico", hatId: null } })));
  it("can rename the cat", () => assertSucceeds(updateDoc(doc(as("alice"), "users/alice"), { cat: { name: "Luna", colorId: "color-black", hatId: null } })));
  it("cannot smuggle extra cat fields", () => assertFails(updateDoc(doc(as("alice"), "users/alice"), { cat: { name: "Luna", colorId: "color-black", hatId: null, admin: true } })));
});

describe("user subcollections", () => {
  it("owner reads/writes progress", async () => {
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice/progress/P6"), { unlockedTopics: [] }));
    await assertSucceeds(getDoc(doc(as("alice"), "users/alice/progress/P6")));
  });
  it("others cannot touch progress", () => assertFails(setDoc(doc(as("bob"), "users/alice/progress/P6"), { x: 1 })));
  it("owner reads/writes wrong bookmarks", () => assertSucceeds(setDoc(doc(as("alice"), "users/alice/wrong/q1"), { at: 1 })));
  it("owner can read ledger", () => assertSucceeds(getDoc(doc(as("alice"), "users/alice/ledger/l1"))));
  it("owner cannot write ledger", () => assertFails(setDoc(doc(as("alice"), "users/alice/ledger/l2"), { delta: 999 })));
  it("owner cannot edit ledger", () => assertFails(updateDoc(doc(as("alice"), "users/alice/ledger/l1"), { delta: 999 })));
  it("attempts are server-only", () => assertFails(getDoc(doc(as("alice"), "users/alice/attempts/a1"))));
});

describe("server-only data", () => {
  it("owner reads wallet", () => assertSucceeds(getDoc(doc(as("alice"), "wallets/alice"))));
  it("others cannot read wallet", () => assertFails(getDoc(doc(as("bob"), "wallets/alice"))));
  it("owner cannot write wallet", () => assertFails(updateDoc(doc(as("alice"), "wallets/alice"), { starBalance: 9999 })));
  it("owner reads entitlement", () => assertSucceeds(getDoc(doc(as("alice"), "entitlements/alice"))));
  it("owner cannot grant themselves an entitlement", () => assertFails(setDoc(doc(as("bob"), "entitlements/bob"), { unlimited: true })));
  it("leaderboard entries are not client readable or writable", async () => {
    await assertFails(getDoc(doc(as("alice"), "leaderboards/monthly-2026-10/entries/alice")));
    await assertFails(setDoc(doc(as("alice"), "leaderboards/monthly-2026-10/entries/alice"), { uid: "alice", stars: 99999 }));
  });
  it("friendCodes / referrals / config are closed", async () => {
    await assertFails(getDoc(doc(as("alice"), "friendCodes/ABCD2345")));
    await assertFails(setDoc(doc(as("alice"), "referrals/alice"), { x: 1 }));
    await assertFails(getDoc(doc(as("alice"), "config/content")));
  });
});

describe("publicProfiles, friends, medals", () => {
  it("signed-in users read public profiles", () => assertSucceeds(getDoc(doc(as("alice"), "publicProfiles/bob"))));
  it("anonymous cannot", () => assertFails(getDoc(doc(as(null), "publicProfiles/bob"))));
  it("nobody writes public profiles from the client", () => assertFails(setDoc(doc(as("bob"), "publicProfiles/bob"), { displayName: "Hax" })));
  it("members read their friendship", () => assertSucceeds(getDoc(doc(as("alice"), "friendships/alice_bob"))));
  it("non-members cannot", () => assertFails(getDoc(doc(as("alice"), "friendships/bob_carol"))));
  it("cannot create a friendship", () => assertFails(setDoc(doc(as("alice"), "friendships/alice_carol"), { members: ["alice", "carol"] })));
  it("friend requests are server-written", () => assertFails(setDoc(doc(as("alice"), "friendRequests/alice_bob"), { from: "alice", to: "bob", status: "accepted" })));
  it("medals readable when signed in, never writable", async () => {
    await assertSucceeds(getDoc(doc(as("alice"), "medals/bob")));
    await assertFails(setDoc(doc(as("alice"), "medals/alice"), { medal: "gold" }));
  });
});
