// Run with: npm run test:rules   (needs Java + firebase-tools; starts the Firestore emulator)
// Student data is server only: no client (signed in or not, owner or not) can read or write any of it.
import { readFileSync } from "node:fs";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-p6-math",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(async () => env?.cleanup());

const PATHS = [
  "users/alice", "users/alice/progress/P6", "users/alice/wrong/q1", "users/alice/ledger/l1", "wallets/alice",
  "publicProfiles/bob", "friendCodes/ABCD2345", "referrals/alice", "friendships/alice_bob", "friendRequests/carol_alice",
  "leaderboards/monthly-2026-10/entries/alice", "medals/alice", "entitlements/alice", "question_reports/q1__alice",
];

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const p of PATHS) await setDoc(doc(ctx.firestore(), p), { uid: "alice", to: "alice", members: ["alice", "bob"], status: "pending" });
  });
});

describe("student data is server only", () => {
  it("the owner can't read or write their own documents", async () => {
    const db = env.authenticatedContext("alice").firestore();
    for (const p of PATHS) {
      await assertFails(getDoc(doc(db, p)));
      await assertFails(setDoc(doc(db, p), { x: 1 }));
    }
    await assertFails(updateDoc(doc(db, "users/alice"), { fullName: "A" }));
  });
  it("queries are refused too", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertFails(getDocs(query(collection(db, "friendRequests"), where("to", "==", "alice"))));
    await assertFails(getDocs(collection(db, "users/alice/wrong")));
  });
  it("signed-out clients get nothing", async () => {
    const db = env.unauthenticatedContext().firestore();
    for (const p of PATHS) await assertFails(getDoc(doc(db, p)));
  });
});
