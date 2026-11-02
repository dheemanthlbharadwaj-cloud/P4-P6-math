// End-to-end check of classroom + admin against the Firebase EMULATORS and the local backend (backend/netlify/dev-server.mjs).
// Nothing here touches a real project: it refuses to run unless both emulator variables are set.
//   cd backend && npx firebase emulators:start --only auth,firestore --project demo-p6-math
//   cd backend/netlify && npm run build && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//     GCLOUD_PROJECT=demo-p6-math node dev-server.mjs
//   (same env) node backend/netlify/scripts/e2e-classroom.mjs     (clear the emulators between runs: emails are fixed)
import { createRequire } from "node:module";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("emulators only: set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST");
const require = createRequire(new URL("../package.json", import.meta.url));
const admin = require("firebase-admin");
const { CONTENT } = await import(new URL("../lib/content/index.js", import.meta.url).href);

admin.initializeApp({ projectId: "demo-p6-math" });
const db = admin.firestore();
const API = "http://127.0.0.1:8888/api/";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:";
const P6 = CONTENT.P6;

let pass = 0, failN = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); c ? pass++ : failN++; };
const idt = async (path, body) => { const r = await fetch(`${AUTH}${path}?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(`${path}: ${j.error?.message}`); return j; };
const signUp = async (email, password) => (await idt("signUp", { email, password, returnSecureToken: true })).idToken;
const signIn = async (email, password) => (await idt("signInWithPassword", { email, password, returnSecureToken: true })).idToken;
const raw = async (tok, name, data = {}) => { const r = await fetch(API + name, { method: "POST", headers: { "content-type": "application/json", ...(tok ? { authorization: "Bearer " + tok } : {}) }, body: JSON.stringify({ data }) }); return r.json(); };
const call = async (tok, name, data) => { const j = await raw(tok, name, data); if (j.error) throw new Error(`${name}: ${j.error.status} ${j.error.message}`); return j.result; };
const msgOf = async (tok, name, data) => (await raw(tok, name, data)).error?.message ?? "";
const errOf = async (tok, name, data) => (await raw(tok, name, data)).error?.status ?? "ok";

// ---------- seed: one admin (as add-admin.mjs would), two students ----------
const ADMIN_EMAIL = "owner@test.local";
const A = await signUp(ADMIN_EMAIL, "admin-pass-123");
const adminUid = (await admin.auth().getUserByEmail(ADMIN_EMAIL)).uid;
await db.doc(`admins/${adminUid}`).set({ uid: adminUid, name: "Owner", email: ADMIN_EMAIL, active: true, createdAt: Date.now() });

const S1 = await signUp("zach@test.local", "student-pass-1");
const p1 = (await call(S1, "bootstrapProfile", { fullName: "Zach Tan", grade: "P6" })).profile;
const S2 = await signUp("mia@test.local", "student-pass-2");
const p2 = (await call(S2, "bootstrapProfile", { fullName: "Mia Lee", grade: "P6" })).profile;

// ---------- access control ----------
ok(await errOf(null, "adminGetOverview") === "unauthenticated", "admin: signed-out refused");
ok(await errOf(S1, "adminGetOverview") === "permission-denied", "admin: student refused");
ok(await errOf(S1, "teacherGetDashboard") === "permission-denied", "teacher: student refused");

// ---------- admin: teachers ----------
const ov0 = await call(A, "adminGetOverview");
ok(ov0.admin.email === ADMIN_EMAIL && Array.isArray(ov0.teachers) && Array.isArray(ov0.classes), "admin: overview");
const t1 = await call(A, "adminSaveTeacher", { email: "ms.tan@test.local", name: "Ms Tan" });
ok(!!t1.password && t1.teacher.active, "admin: add teacher returns a one-time password");
const T1 = await signIn("ms.tan@test.local", t1.password);
ok((await call(T1, "teacherGetDashboard")).teacher.name === "Ms Tan", "teacher 1 signs in with that password");
const t2 = await call(A, "adminSaveTeacher", { email: "mr.lim@test.local", name: "Mr Lim" });
let T2 = await signIn("mr.lim@test.local", t2.password);
const t1again = await call(A, "adminSaveTeacher", { email: "ms.tan@test.local", name: "Ms Tan Wei" });
ok(!t1again.password && t1again.teacher.name === "Ms Tan Wei", "admin: rename teacher, no new password");

// ---------- teacher flow (as before) ----------
const { classId } = await call(T1, "teacherSaveClass", { name: "6 Courage", grade: "P6" });
await call(T1, "teacherAddStudent", { classId, friendCode: p1.friendCode });
ok(await errOf(T2, "teacherListTasks", { classId }) === "permission-denied", "teacher 2 cannot open teacher 1's class");
const { post } = await call(T1, "teacherPost", { classId, text: "Next class Thursday." });
ok((await call(T1, "teacherListPosts", { classId })).posts.some((p) => p.id === post.id), "teacher: post + list posts");
const levelKey = Object.keys(P6.levels).find((k) => P6.levels[k].some((q) => P6.answers[q]?.t === "mcq"));
const [subtopicId, lv] = levelKey.split("#");
const { task } = await call(T1, "teacherCreateTask", { classId, kind: "worksheet", subtopicId, level: Number(lv) });
const mcqId = task.questionIds.find((q) => P6.answers[q]?.t === "mcq");
const marks = Object.fromEntries(task.questionIds.map((q) => [q, q === mcqId ? "wrong" : "right"]));
const m1 = await call(T1, "teacherMarkTask", { classId, taskId: task.id, studentUid: p1.uid, marks });
ok(m1.starsAwarded === task.questionIds.length - 1, `marking: ${m1.starsAwarded} stars for ${task.questionIds.length - 1} right`);
ok((await call(T1, "teacherMarkTask", { classId, taskId: task.id, studentUid: p1.uid, marks })).starsAwarded === 0, "marking: idempotent");
let mine = await call(S1, "getMyClassroom");
ok(mine.homework.includes(mcqId), "student: wrong mark became homework");
const wrongDoc = await db.doc(`users/${p1.uid}/wrong/${mcqId}`).get();
ok(wrongDoc.exists, "student: wrong mark is in Unlimited Mistakes");

// open point: a homework run is sent as a "mistakes" round; a right answer must clear the homework
const hw = await call(S1, "submitMinigameResult", { attemptId: "hwtest_" + Date.now(), grade: "P6", mode: "mistakes", finishedAt: Date.now(),
  answers: [{ questionId: mcqId, responses: [P6.answers[mcqId].o] }] });
ok(!!hw, "homework round accepted by submitMinigameResult");
mine = await call(S1, "getMyClassroom");
ok(!mine.homework.includes(mcqId), "homework cleared after answering it right");

const dia = (await call(T1, "teacherCreateTask", { classId, kind: "diagnostic", topicId: P6.topics[0].id, inApp: true })).task;
const first = await call(S1, "submitTaskAnswers", { classId, taskId: dia.id, answers: dia.questionIds.map((q) => ({ questionId: q, responses: ["0"] })) });
const again = await call(S1, "submitTaskAnswers", { classId, taskId: dia.id, answers: dia.questionIds.map((q) => ({ questionId: q, responses: [P6.answers[q]?.o ?? "1"] })) });
ok(JSON.stringify(again.marks) === JSON.stringify(first.marks), "in-app test: a second submission cannot change the marks");
const an = await call(T1, "teacherGetAnalytics", { classId, studentUid: p1.uid });
ok(an.student.questions.length > 0 && an.class.students.length === 1, "teacher: analytics");

// ---------- admin: logins ----------
const byCode = await call(A, "adminFindUser", { query: p2.friendCode.toLowerCase() });
ok(byCode.users[0]?.uid === p2.uid && byCode.users[0].providers.includes("password"), "admin: find by friend code (any case)");
ok((await call(A, "adminFindUser", { query: "zach@test.local" })).users[0]?.classIds.includes(classId), "admin: find by email shows classes");
ok((await call(A, "adminFindUser", { query: p1.uid })).users[0]?.displayName === "Zach Tan", "admin: find by uid");
ok((await call(A, "adminFindUser", { query: "nobody@test.local" })).users.length === 0, "admin: unknown login → empty");
const tRow = (await call(A, "adminFindUser", { query: "ms.tan@test.local" })).users[0];
ok(tRow?.isTeacher === true && tRow.teacherActive === true, "admin: teacher login shows teacher badge");

// ---------- admin: classes ----------
await call(A, "adminAddStudent", { classId, friendCode: p2.friendCode });
ok((await call(S2, "getMyClassroom")).classes.length === 1, "admin: add student → student sees the class");
await call(A, "adminRemoveStudent", { classId, studentUid: p2.uid });
ok((await call(S2, "getMyClassroom")).classes.length === 0, "admin: remove student → 'not in any class'");
ok((await db.doc(`users/${p2.uid}`).get()).data().classIds?.length === 0, "admin: classIds kept in step");
const { classId: c2 } = await call(A, "adminSaveClass", { name: "6 Honesty", grade: "P6", teacherUid: t2.teacher.uid });
ok((await call(T2, "teacherGetDashboard")).classes.some((c) => c.id === c2), "admin: create class for teacher 2");
await call(A, "adminSaveClass", { id: classId, name: "6 Courage", grade: "P6", teacherUid: t2.teacher.uid });
ok(await errOf(T1, "teacherListTasks", { classId }) === "permission-denied", "admin: moved class — old teacher loses it");
ok((await call(T2, "teacherListTasks", { classId })).tasks.length === 2, "admin: moved class — new teacher has its tasks");
ok(await errOf(A, "adminSaveClass", { id: classId, name: "x", grade: "P6", teacherUid: p1.uid }) !== "ok", "admin: cannot assign a class to a non-teacher");

// ---------- admin: passwords and disabling ----------
const reset = await call(A, "adminResetPassword", { uid: t2.teacher.uid });
ok(!!reset.password && reset.password !== t2.password, "admin: reset password returns a new one");
ok(await idt("signInWithPassword", { email: "mr.lim@test.local", password: t2.password }).then(() => false, () => true), "old password no longer works");
T2 = await signIn("mr.lim@test.local", reset.password);
ok(!!T2, "new password works");
ok(await errOf(A, "adminSetUserDisabled", { uid: adminUid, disabled: true }) !== "ok", "admin: cannot disable own login");
ok(await errOf(A, "adminSetTeacherActive", { uid: adminUid, active: false }) !== "ok", "admin: cannot deactivate self");
await call(A, "adminSetUserDisabled", { uid: p2.uid, disabled: true });
ok(await idt("signInWithPassword", { email: "mia@test.local", password: "student-pass-2" }).then(() => false, () => true), "admin: disabled student cannot sign in");
await call(A, "adminSetUserDisabled", { uid: p2.uid, disabled: false });
ok(!!(await signIn("mia@test.local", "student-pass-2")), "admin: re-enabled student signs in");
await call(A, "adminSetTeacherActive", { uid: t1.teacher.uid, active: false });
ok(await idt("signInWithPassword", { email: "ms.tan@test.local", password: t1.password }).then(() => false, () => true), "admin: disabled teacher cannot sign in");
await call(A, "adminSetTeacherActive", { uid: t1.teacher.uid, active: true });


// ---------- review fixes ----------
// (2) other admins are managed with add-admin.mjs
const ADMIN2_EMAIL = "owner2@test.local";
const A2 = await signUp(ADMIN2_EMAIL, "admin-pass-456");
const admin2Uid = (await admin.auth().getUserByEmail(ADMIN2_EMAIL)).uid;
await db.doc(`admins/${admin2Uid}`).set({ uid: admin2Uid, name: "Owner Two", email: ADMIN2_EMAIL, active: true, createdAt: Date.now() });
ok(await errOf(A, "adminResetPassword", { uid: admin2Uid }) === "failed-precondition" && (await msgOf(A, "adminResetPassword", { uid: admin2Uid })) === "Other admins are managed with add-admin.mjs", "fix2: reset another admin's password refused");
ok(await errOf(A, "adminSetUserDisabled", { uid: admin2Uid, disabled: true }) === "failed-precondition", "fix2: disable another admin refused");
ok(await errOf(A, "adminSetUserDisabled", { uid: admin2Uid, disabled: false }) === "failed-precondition", "fix2: enable another admin refused too");
ok(await errOf(A, "adminSetTeacherActive", { uid: admin2Uid, active: false }) === "failed-precondition", "fix2: deactivate another admin refused (even before the teacher check)");
ok(!(await admin.auth().getUser(admin2Uid)).disabled, "fix2: the other admin's login is untouched");
ok(!!(await signIn(ADMIN2_EMAIL, "admin-pass-456")), "fix2: the other admin's password still works");

// (1) a disabled login loses access at once
const t3 = await call(A, "adminSaveTeacher", { email: "ms.ong@test.local", name: "Ms Ong" });
const T3 = await signIn("ms.ong@test.local", t3.password);
ok((await call(T3, "teacherGetDashboard")).teacher.active === true, "fix1: teacher 3 works before disabling");
await call(A, "adminSetUserDisabled", { uid: t3.teacher.uid, disabled: true });
ok(await errOf(T3, "teacherGetDashboard") === "unauthenticated", "fix1: disabled teacher's existing token refused at once");
ok((await db.doc(`teachers/${t3.teacher.uid}`).get()).data().active === false, "fix1: disabling a login also sets teachers.active=false");
await call(A, "adminSetUserDisabled", { uid: t3.teacher.uid, disabled: false });
ok((await db.doc(`teachers/${t3.teacher.uid}`).get()).data().active === false, "fix1: enabling the login leaves teachers.active as it was (false)");
const T3b = await signIn("ms.ong@test.local", t3.password);
ok(await errOf(T3b, "teacherGetDashboard") === "permission-denied", "fix1: re-enabled login is still an inactive teacher");
await call(A, "adminSetTeacherActive", { uid: t3.teacher.uid, active: true });
const T3c = await signIn("ms.ong@test.local", t3.password);
ok((await call(T3c, "teacherGetDashboard")).teacher.active === true, "fix1: adminSetTeacherActive re-activates");
// revoked tokens: reset password revokes, the old token of an admin* caller is refused
const A3 = await signUp("owner3@test.local", "admin-pass-789");
const admin3Uid = (await admin.auth().getUserByEmail("owner3@test.local")).uid;
await db.doc(`admins/${admin3Uid}`).set({ uid: admin3Uid, name: "Owner Three", email: "owner3@test.local", active: true, createdAt: Date.now() });
await new Promise((r) => setTimeout(r, 1100)); // revocation has 1 s resolution: the token must be older than the reset
ok((await call(A3, "adminResetPassword", { uid: admin3Uid })).password.length >= 16, "fix2: an admin may reset their own password");
await new Promise((r) => setTimeout(r, 1100));
ok(await errOf(A3, "adminGetOverview") === "unauthenticated", "fix1: revoked admin token refused (checkRevoked)");
// (the emulator always checks revocation, so "student callables skip the check" is covered by the needsRevocationCheck unit test only)

// (4) rename by uid never creates a login
const countUsers = async () => (await admin.auth().listUsers(1000)).users.length;
const before = await countUsers();
const ren = await call(A, "adminSaveTeacher", { uid: t3.teacher.uid, email: "ms.ong@test.local", name: "Ms Ong Li" });
ok(ren.teacher.name === "Ms Ong Li" && !ren.password && (await countUsers()) === before, "fix4: rename with uid renames, no password, no new login");
const ren2 = await call(A, "adminSaveTeacher", { uid: t3.teacher.uid, email: "someone.else@test.local", name: "Ms Ong Lim" });
ok(ren2.teacher.email === "ms.ong@test.local" && (await countUsers()) === before, "fix4: a different email in the request creates nothing and the stored email is kept");
ok(await errOf(A, "adminSaveTeacher", { uid: "nosuchuid123", email: "ghost@test.local", name: "Ghost" }) === "not-found" && (await countUsers()) === before, "fix4: rename with an unknown uid is not-found and creates no login");
ok(await errOf(A, "adminSaveTeacher", { uid: p1.uid, email: "zach@test.local", name: "Zach" }) === "not-found", "fix4: uid of a non-teacher is not-found (no promotion)");

// (5) promoting a disabled login is refused
await call(A, "adminSetUserDisabled", { uid: p2.uid, disabled: true });
ok(await errOf(A, "adminSaveTeacher", { email: "mia@test.local", name: "Mia Lee" }) === "failed-precondition" && (await msgOf(A, "adminSaveTeacher", { email: "mia@test.local", name: "Mia Lee" })) === "Enable this login first", "fix5: promoting a disabled login refused");
ok(!(await db.doc(`teachers/${p2.uid}`).get()).exists, "fix5: no teacher doc was written");
await call(A, "adminSetUserDisabled", { uid: p2.uid, disabled: false });
ok(!!(await call(A, "adminSaveTeacher", { email: "mia@test.local", name: "Mia Lee" })).teacher && !(await call(A, "adminSaveTeacher", { email: "mia@test.local", name: "Mia Lee" })).password, "fix5: after enabling, promotion works (no new password)");

// (3) a moved class can't be written by the old teacher from a stale cache
const { classId: c3 } = await call(T3c, "teacherSaveClass", { name: "Stale Test", grade: "P6" });
await call(T3c, "teacherListTasks", { classId: c3 }); // caches the class on this instance
await db.doc(`classes/${c3}`).update({ teacherUid: t2.teacher.uid }); // moved behind this instance's back (as another instance would)
ok(await errOf(T3c, "teacherListTasks", { classId: c3 }) === "ok", "fix3: (setup) read-only callable still served from the 60 s cache");
ok(await errOf(T3c, "teacherPost", { classId: c3, text: "hello" }) === "permission-denied", "fix3: teacherPost reads fresh, refused");
ok(await errOf(T3c, "teacherSaveClass", { id: c3, name: "Mine now", grade: "P6" }) === "permission-denied", "fix3: rename refused");
ok(await errOf(T3c, "teacherCreateTask", { classId: c3, kind: "diagnostic", topicId: P6.topics[0].id, inApp: true }) === "permission-denied", "fix3: create task refused");
ok(await errOf(T3c, "teacherDeleteClass", { classId: c3 }) === "permission-denied", "fix3: delete class refused");
ok((await db.doc(`classes/${c3}`).get()).exists && (await db.doc(`classes/${c3}`).get()).data().name === "Stale Test", "fix3: the class is untouched");

// (6) already on the roster: classIds drift is repaired
const { classId: c5 } = await call(A, "adminSaveClass", { name: "Drift", grade: "P6", teacherUid: t2.teacher.uid });
await call(A, "adminAddStudent", { classId: c5, friendCode: p1.friendCode });
await db.doc(`users/${p1.uid}`).update({ classIds: [] });
const again5 = await call(A, "adminAddStudent", { classId: c5, friendCode: p1.friendCode });
ok(again5.student.uid === p1.uid && (await db.doc(`users/${p1.uid}`).get()).data().classIds.includes(c5), "fix6: add on an already-on-roster student repairs users.classIds");

// (7) no stub users docs
const ghost = "ghostuser0001";
await db.doc(`classes/${c5}`).update({ students: admin.firestore.FieldValue.arrayUnion({ uid: ghost, displayName: "Ghost" }) });
await call(A, "adminRemoveStudent", { classId: c5, studentUid: ghost });
ok(!(await db.doc(`users/${ghost}`).get()).exists, "fix7: remove student does not create a users stub");
await db.doc(`classes/${c5}`).update({ students: admin.firestore.FieldValue.arrayUnion({ uid: ghost, displayName: "Ghost" }, { uid: p1.uid, displayName: "Zach Tan" }) });
await call(A, "adminDeleteClass", { classId: c5 });
ok(!(await db.doc(`users/${ghost}`).get()).exists, "fix7: delete class does not create a users stub for a missing account");
ok(!(await db.doc(`users/${p1.uid}`).get()).data().classIds.includes(c5), "fix7: delete class still removes the class from real students");

// ---------- admin: delete class ----------
await call(A, "adminDeleteClass", { classId });
ok((await call(S1, "getMyClassroom")).classes.length === 0, "admin: delete class → student not in any class");
ok((await db.doc(`users/${p1.uid}`).get()).data().classIds?.length === 0, "admin: delete class clears classIds");
ok((await db.collection(`classes/${classId}/tasks`).get()).empty, "admin: delete class removes tasks");
const log = await db.collection("adminLog").get();
ok(log.size >= 10, `admin: every change logged (${log.size} entries)`);
ok(!JSON.stringify(log.docs.map((d) => d.data())).includes(reset.password), "admin log never contains a password");

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
