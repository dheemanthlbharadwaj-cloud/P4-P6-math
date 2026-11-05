// End-to-end check of the Catapult Classroom backend (staff, families, parent codes, lessons, sessions, parent view) against
// the Firebase EMULATORS and the local dev server. Refuses to run without the emulator variables. Clear the emulators between runs.
//   cd backend-classroom && npm run emulators          (another terminal)
//   npm run build && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-classroom node scripts/dev-server.mjs
//   (same env) node scripts/e2e.mjs
import { createRequire } from "node:module";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("emulators only: set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST");
const require = createRequire(new URL("../package.json", import.meta.url));
const admin = require("firebase-admin");
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-classroom" });
const db = admin.firestore();
const API = "http://127.0.0.1:8899/api/";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:";
let pass = 0, failN = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); c ? pass++ : failN++; };
const idt = async (path, body) => { const r = await fetch(`${AUTH}${path}?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(`${path}: ${j.error?.message}`); return j; };
const signUp = async (email, password) => (await idt("signUp", { email, password, returnSecureToken: true })).idToken;
const raw = async (tok, name, data = {}) => { const r = await fetch(API + name, { method: "POST", headers: { "content-type": "application/json", ...(tok ? { authorization: "Bearer " + tok } : { "x-forwarded-for": `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }) }, body: JSON.stringify({ data }) }); return r.json(); };
const call = async (tok, name, data) => { const j = await raw(tok, name, data); if (j.error) throw new Error(`${name}: ${j.error.status} ${j.error.message}`); return j.result; };
const errOf = async (tok, name, data) => (await raw(tok, name, data)).error?.status ?? "ok";
const parentToken = async (code) => { const { token } = await call(null, "parentSignIn", { code }); return (await idt("signInWithCustomToken", { token, returnSecureToken: true })).idToken; };
const codeToken = async (code) => { const { token, kind } = await call(null, "codeSignIn", { code }); return { kind, idToken: (await idt("signInWithCustomToken", { token, returnSecureToken: true })).idToken }; };

// seed: an admin (as add-admin.mjs would), two teachers made by the admin
const A = await signUp("owner@test.local", "owner-pass-123");
const aUid = (await admin.auth().getUserByEmail("owner@test.local")).uid;
await db.doc(`admins/${aUid}`).set({ uid: aUid, name: "Owner", email: "owner@test.local", active: true, createdAt: Date.now() });
const lisaSave = await call(A, "adminSaveTeacher", { email: "lisa@test.local", name: "Teacher Lisa" });
const tomSave = await call(A, "adminSaveTeacher", { name: "Teacher Tom" }); // no email: a login without email or password
ok(/^[A-Z2-9]{12}$/.test(lisaSave.code) && /^[A-Z2-9]{12}$/.test(tomSave.code) && !("password" in lisaSave) && tomSave.teacher.email === "", "admin: new teachers get a 12-char access code (email optional), no password");
ok(!(await db.collection("staffCodes").get()).docs.some((d) => d.id === lisaSave.code || JSON.stringify(d.data()).includes(lisaSave.code)), "the staff code is never stored in clear");
const lisaIn = await codeToken(lisaSave.code);
const T1 = lisaIn.idToken;
let T2 = (await codeToken(tomSave.code.toLowerCase().replace(/(.{4})(.{4})(.{4})/, "$1-$2-$3"))).idToken; // typed in lower case with dashes
ok(lisaIn.kind === "staff" && (await call(T1, "getMyRoles")).teacher, "codeSignIn: a staff code signs the teacher in");
ok(await errOf(null, "codeSignIn", { code: "ABCDEFGHJKMN" }) === "not-found" && await errOf(null, "codeSignIn", { code: "ABC" }) === "not-found", "codeSignIn: a wrong staff code is refused");
const S = await signUp("kid@test.local", "kid-pass-123");

// staff
ok(JSON.stringify(await call(A, "getMyRoles")) === JSON.stringify({ teacher: false, admin: true }) && (await call(T1, "getMyRoles")).teacher, "getMyRoles: admin / teacher");
ok(!(await call(S, "getMyRoles")).teacher, "getMyRoles: a plain login has no area");
ok((await call(A, "adminGetOverview")).teachers.length === 2, "admin: overview lists the teachers");
ok(await errOf(T1, "adminGetOverview") === "permission-denied", "a teacher is not an admin");
ok(!("code" in await call(A, "adminSaveTeacher", { uid: tomSave.teacher.uid, name: "Mr Tom" })), "admin: rename teacher, no new code");
const tomCode2 = (await call(A, "adminResetAccessCode", { uid: tomSave.teacher.uid })).code;
ok(tomCode2 !== tomSave.code && await errOf(null, "codeSignIn", { code: tomSave.code }) === "not-found" && (await codeToken(tomCode2)).kind === "staff", "adminResetAccessCode: the old code stops, the new one works");
ok(await errOf(T1, "adminResetAccessCode", { uid: tomSave.teacher.uid }) === "permission-denied", "a teacher can't reset codes");
ok(await errOf(A, "adminSetTeacherActive", { uid: tomSave.teacher.uid, active: false }) === "ok" && await errOf(null, "codeSignIn", { code: tomCode2 }) === "not-found", "a disabled teacher's code is refused");
await call(A, "adminSetTeacherActive", { uid: tomSave.teacher.uid, active: true });
T2 = (await codeToken(tomCode2)).idToken; // the reset revoked the old session
ok(await errOf(null, "nope") === "not-found", "unknown function refused");

ok(await errOf(S, "teacherGetStudents") === "permission-denied", "a plain login is not staff");
ok(await errOf(null, "teacherListLessons") === "unauthenticated", "signed out: refused");

// families
const fam = await call(T1, "teacherSaveFamily", { parentName: "Ning Lee", children: [{ name: "Zimo Lee", level: "P5" }, { name: "Ziqiao Lee", level: "P6" }] });
ok(/^[A-Z2-9]{10}$/.test(fam.code) && fam.children.length === 2, "teacher: new family → 10-char code shown once, 2 children");
ok(!(await db.collection("familyCodes").get()).docs.some((d) => JSON.stringify(d.data()).includes(fam.code) || d.id === fam.code), "the code is never stored in clear");
ok((await call(T1, "teacherGetStudents")).families.length === 1, "teacher sees their family");
ok((await call(T2, "teacherGetStudents")).families.length === 0, "another teacher does not");
ok((await call(A, "teacherGetStudents")).families.length === 1 && (await call(A, "teacherGetStudents")).teachers.length === 2, "admin sees every family + the teachers");
ok(await errOf(T2, "teacherGetChild", { childId: fam.children[0].id }) === "not-found", "another teacher can't open the child");
ok(await errOf(T2, "teacherResetFamilyCode", { familyId: fam.family.id }) === "permission-denied", "another teacher can't reset the code");

// lessons
const { lesson } = await call(T1, "teacherSaveLesson", { title: "Science paper practice", subject: "science", level: "P5", intro: "Today, {names} completed their science papers.",
  goals: [{ text: "MCQ", scripts: { good: "{name} got full marks for the MCQ.", ok: "{name} did fairly well in the MCQ.", bad: "{name} found the MCQ hard." } },
    { text: "Keywords", scripts: { good: "{name} used the keywords well.", ok: "{name} is applying more keywords.", bad: "{name} forgot keywords." } }],
  parts: [{ title: "MCQ section" }, { title: "Open-ended section" }] });
ok(lesson.goals.length === 2 && lesson.parts.length === 2, "teacher: lesson with goals, scripts and parts");
ok((await call(T2, "teacherListLessons")).lessons.some((l) => l.id === lesson.id), "the lesson library is shared with every teacher");

// parent sign-in before any lesson
const P = await parentToken(fam.code.toLowerCase().replace(/(.{5})/, "$1-"));
const home0 = await call(P, "parentGetHome");
ok(home0.children.length === 2 && home0.reports.length === 0, "parent: code (any case, with dash) → both children, no lessons yet");
ok(await errOf(null, "parentSignIn", { code: "ABCDEFGHJK" }) === "not-found", "parent: a wrong code is refused");
ok(await errOf(P, "teacherGetStudents") === "permission-denied", "parent can't use teacher calls");
ok(await errOf(S, "parentGetHome") === "permission-denied", "a normal login can't open a family");

// run a lesson
const [zimo, ziqiao] = fam.children;
const [g1, g2] = lesson.goals.map((g) => g.id);
const text = "Hi Ning!\n\nToday, Zimo and Ziqiao completed their science papers.";
const sess = await call(T1, "teacherSaveSession", { lessonId: lesson.id, date: Date.UTC(2026, 10, 1),
  reports: [{ childId: zimo.id, goals: { [g1]: "good", [g2]: "ok" }, note: "She didn't finish in time.", partsDone: [lesson.parts[0].id] },
    { childId: ziqiao.id, goals: { [g1]: "good", [g2]: "ok" }, note: "", partsDone: lesson.parts.map((p) => p.id) }],
  familyTexts: { [fam.family.id]: text } });
ok(sess.reports.length === 2, "teacher: lesson session → one report per child");
ok(await errOf(T2, "teacherSaveSession", { lessonId: lesson.id, date: Date.now(), reports: [{ childId: zimo.id, goals: {}, note: "", partsDone: [] }], familyTexts: {} }) === "permission-denied",
  "another teacher can't report on these children");
const child = await call(T1, "teacherGetChild", { childId: zimo.id });
ok(child.reports.length === 1 && child.reports[0].partsDone.length === 1, "teacher: child profile shows the report, with parts done");
const home1 = await call(P, "parentGetHome");
ok(home1.reports.length === 2 && home1.lessons[0]?.title === "Science paper practice", "parent: sees both children's completed lesson");
ok(home1.reports.every((r) => r.partsDone === undefined && r.teacherUid === undefined), "parent: never sees which parts were done");
ok(!JSON.stringify(home1.lessons).includes("full marks"), "parent: no feedback scripts, only goal names");
ok(home1.feedback[sess.session.id] === text, "parent: sees the feedback text sent to them");

// edit the session: drop a child
await call(T1, "teacherSaveSession", { id: sess.session.id, lessonId: lesson.id, date: Date.UTC(2026, 10, 1),
  reports: [{ childId: zimo.id, goals: { [g1]: "ok" }, note: "", partsDone: [] }], familyTexts: { [fam.family.id]: text } });
ok((await call(P, "parentGetHome")).reports.length === 1, "teacher: editing the session removes a child's report");

// reset code: old code and old sign-in stop
await new Promise((r) => setTimeout(r, 1100)); // Auth keeps revocation times in whole seconds: a sign-in in the same second still counts
const { code: code2 } = await call(T1, "teacherResetFamilyCode", { familyId: fam.family.id });
ok(code2 !== fam.code && await errOf(null, "parentSignIn", { code: fam.code }) === "not-found", "reset: old code refused");
ok(await errOf(P, "parentGetHome") === "unauthenticated", "reset: old parent sign-in ends at once");
const P2 = await parentToken(code2);
ok((await call(P2, "parentGetHome")).children.length === 2, "reset: new code works");

// lessons can be archived without breaking history; families can be deleted
await call(T1, "teacherDeleteLesson", { lessonId: lesson.id });
ok(!(await call(T1, "teacherListLessons")).lessons.some((l) => l.id === lesson.id) && (await call(P2, "parentGetHome")).lessons.length === 1, "archived lesson: gone from the library, history kept");
await call(A, "teacherDeleteFamily", { familyId: fam.family.id });
ok(await errOf(null, "parentSignIn", { code: code2 }) === "not-found", "delete family: the code stops working");
ok((await db.collection("children").get()).empty && (await db.collection("reports").get()).empty, "delete family: children and reports removed");

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
