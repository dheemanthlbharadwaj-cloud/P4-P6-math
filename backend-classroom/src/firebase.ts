// Firebase Admin for the CLASSROOM project only (never the game's projects). Credentials: CLASSROOM_SERVICE_ACCOUNT_B64
// (base64 of a key JSON for the backend's service account; set on the Netlify site by scripts/deploy.mjs). With the
// emulators (FIRESTORE_EMULATOR_HOST + FIREBASE_AUTH_EMULATOR_HOST) no key is needed.
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function app(): App {
  if (getApps().length) return getApps()[0]!;
  if (process.env.FIRESTORE_EMULATOR_HOST) return initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-classroom" });
  const b64 = process.env.CLASSROOM_SERVICE_ACCOUNT_B64;
  if (!b64) throw new Error("CLASSROOM_SERVICE_ACCOUNT_B64 is not set");
  const sa = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as { project_id: string; client_email: string; private_key: string };
  return initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id });
}
export const db = getFirestore(app());
export const auth = getAuth(app());

export const col = {
  teachers: "teachers",
  admins: "admins",
  adminLog: "adminLog",
  families: "families",
  familyCodes: "familyCodes",
  staffCodes: "staffCodes",
  children: "children",
  lessons: "lessons",
  sessions: "sessions",
  reports: "reports",
} as const;
