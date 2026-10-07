// The rules as deployed in primary-math-sg: the editor's rules (snapshot in editor.fixture.rules) merged with the
// student rules by scripts/rules-merge.mjs. Checks the editor keeps working, students stay out of editor data, and
// the report rules. Run with: npm run test:rules
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { mergeRules } from "../scripts/rules-merge.mjs";

let env: RulesTestEnvironment;

beforeAll(async () => {
  const rules = mergeRules(readFileSync("test-rules/editor.fixture.rules", "utf8"), readFileSync("firestore.rules", "utf8"), readFileSync("firestore.editor-reports.rules", "utf8"));
  env = await initializeTestEnvironment({ projectId: "demo-p6-merged", firestore: { rules, host: "127.0.0.1", port: 8080 } });
});
afterAll(async () => env?.cleanup());

const report = (over: object = {}) => ({
  question_id: "2023_X_P2_Q05", access_key: "Fractions|LV2", reason: "wrong-answer", note: "should be 3/4", status: "open",
  reporter_uid: "alice", resolved_by: null, resolved_at: null, ...over,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "admins/boss"), { role: "master" });
    await setDoc(doc(db, "volunteers/vera"), { username: "vera", active: true, keys: ["Fractions|LV2"] });
    await setDoc(doc(db, "questions/2023_X_P2_Q05"), { id: "2023_X_P2_Q05", chapter: "Fractions", difficulty: "LV2", access_key: "Fractions|LV2" });
    await setDoc(doc(db, "questions/2023_X_P2_Q09"), { id: "2023_X_P2_Q09", chapter: "Algebra", difficulty: "LV2", access_key: "Algebra|LV2" });
    await setDoc(doc(db, "question_reports/2023_X_P2_Q05__alice"), report());
    await setDoc(doc(db, "question_reports/2023_X_P2_Q09__alice"), report({ question_id: "2023_X_P2_Q09", access_key: "Algebra|LV2" }));
    await setDoc(doc(db, "users/alice"), { uid: "alice", fullName: "Alice", school: "", grade: "P6", topicsLearnt: [], psleDate: "", cat: { name: "Mochi", colorId: "color-black", hatId: null }, friendCode: "ABCD2345" });
    await setDoc(doc(db, "wallets/alice"), { starBalance: 5, inventory: ["color-black"] });
    await setDoc(doc(db, "volunteer_secrets/vera"), { password: "x" });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe("editor keeps working", () => {
  it("master reads and edits questions; volunteer only in scope", async () => {
    await assertSucceeds(getDoc(doc(as("boss"), "questions/2023_X_P2_Q09")));
    await assertSucceeds(getDoc(doc(as("vera"), "questions/2023_X_P2_Q05")));
    await assertFails(getDoc(doc(as("vera"), "questions/2023_X_P2_Q09")));
    await assertSucceeds(getDoc(doc(as("boss"), "volunteer_secrets/vera")));
  });
});

describe("students stay out of editor data", () => {
  it("cannot read questions, volunteers, secrets or reports", async () => {
    for (const p of ["questions/2023_X_P2_Q05", "volunteers/vera", "volunteer_secrets/vera", "admins/boss", "question_reports/2023_X_P2_Q05__alice", "meta/structure", "config/content"]) {
      await assertFails(getDoc(doc(as("alice"), p)));
    }
  });
  it("still use their own data", async () => {
    await assertSucceeds(getDoc(doc(as("alice"), "wallets/alice")));
    await assertSucceeds(updateDoc(doc(as("alice"), "users/alice"), { school: "Rosyth" }));
    await assertFails(setDoc(doc(as("alice"), "question_reports/x__alice"), report()));
  });
});

describe("question reports in the editor", () => {
  it("master reads every report; volunteer only in scope", async () => {
    await assertSucceeds(getDoc(doc(as("boss"), "question_reports/2023_X_P2_Q09__alice")));
    await assertSucceeds(getDoc(doc(as("vera"), "question_reports/2023_X_P2_Q05__alice")));
    await assertFails(getDoc(doc(as("vera"), "question_reports/2023_X_P2_Q09__alice")));
  });
  it("volunteer resolves with their own name, status fields only", async () => {
    const ref = doc(as("vera"), "question_reports/2023_X_P2_Q05__alice");
    await assertFails(updateDoc(ref, { status: "resolved", resolved_by: "someone-else", resolved_at: 1 }));
    await assertFails(updateDoc(ref, { status: "resolved", resolved_by: "vera", note: "changed" }));
    await assertFails(updateDoc(ref, { status: "deleted", resolved_by: "vera" }));
    await assertSucceeds(updateDoc(ref, { status: "resolved", resolved_by: "vera", resolved_at: 1, resolution_note: "fixed the key" }));
  });
  it("inactive volunteer cannot", async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), "volunteers/vera"), { active: false }));
    await assertFails(getDoc(doc(as("vera"), "question_reports/2023_X_P2_Q05__alice")));
  });
});
