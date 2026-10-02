// Read-only download of the editor bank (Firestore project primary-math-sg, database id "default")
// + figure images. Never writes to Firestore.
import fs from "node:fs";
import path from "node:path";
import type { Grade } from "@p6/shared";
import { fetch as ufetch, ProxyAgent, type Dispatcher } from "undici";
import { rawDir, rawFiguresDir, sanitizeId, snapshotPath } from "./paths";
import type { RawDoc } from "./source";

export const EDITOR_PROJECT = "primary-math-sg";
export const EDITOR_DATABASE = "default"; // named DB. "(default)" silently returns an empty DB.

export interface ServiceAccount { client_email: string; private_key: string; project_id?: string; [k: string]: unknown }

export class CredentialsError extends Error {}

export function loadCredentials(env = process.env): ServiceAccount {
  let text: string | undefined;
  // Base64 form fits single-line KEY=value environment editors (raw JSON has quotes, spaces and "=").
  const b64 = env.FIREBASE_SERVICE_ACCOUNT_B64?.trim();
  const json = env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (b64) text = Buffer.from(b64, "base64").toString("utf8");
  else if (json) text = json.startsWith("{") ? json : Buffer.from(json, "base64").toString("utf8");
  else if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    if (!fs.existsSync(env.GOOGLE_APPLICATION_CREDENTIALS)) throw new CredentialsError(`GOOGLE_APPLICATION_CREDENTIALS points to a missing file: ${env.GOOGLE_APPLICATION_CREDENTIALS}`);
    text = fs.readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, "utf8");
  }
  if (!text) {
    throw new CredentialsError(
      "No Firebase credentials found.\nSet FIREBASE_SERVICE_ACCOUNT_B64 (the key file base64-encoded: `base64 -w0 key.json`), FIREBASE_SERVICE_ACCOUNT_JSON (the JSON as a string) or GOOGLE_APPLICATION_CREDENTIALS (path to the key file).\nA read-only role (Cloud Datastore Viewer) on project " + EDITOR_PROJECT + " is enough.",
    );
  }
  let j: ServiceAccount;
  try { j = JSON.parse(text); } catch { throw new CredentialsError("Service-account credentials are not valid JSON."); }
  if (!j.client_email || !j.private_key) throw new CredentialsError("Service-account JSON is missing client_email/private_key.");
  return j;
}

// ---------- HTTP with optional HTTPS proxy ----------
export function makeDispatcher(env = process.env): Dispatcher | undefined {
  const proxy = env.HTTPS_PROXY || env.https_proxy;
  return proxy ? new ProxyAgent(proxy) : undefined;
}

export async function withRetry<T>(fn: () => Promise<T>, tries = 5, baseMs = 500, label = ""): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (e instanceof NonRetryable) throw e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, baseMs * 2 ** i + Math.random() * 200));
    }
  }
  throw new Error(`${label || "request"} failed after ${tries} tries: ${(last as Error)?.message ?? last}`);
}
class NonRetryable extends Error {}

// ---------- Firestore REST ----------
type FsValue = Record<string, unknown>;
export function fromFsValue(v: FsValue): unknown {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return ((v.arrayValue as { values?: FsValue[] }).values ?? []).map(fromFsValue);
  if ("mapValue" in v) return fromFsFields((v.mapValue as { fields?: Record<string, FsValue> }).fields ?? {});
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("bytesValue" in v) return v.bytesValue;
  return null;
}
export function fromFsFields(fields: Record<string, FsValue>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) o[k] = fromFsValue(v);
  return o;
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  const { JWT } = await import("google-auth-library");
  const jwt = new JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/datastore"] });
  const t = await jwt.getAccessToken();
  if (!t.token) throw new Error("could not mint an OAuth access token");
  return t.token;
}

export async function fetchViaRest(sa: ServiceAccount, log = console.log): Promise<RawDoc[]> {
  const dispatcher = makeDispatcher();
  const token = await withRetry(() => accessToken(sa), 3, 500, "oauth token");
  const base = `https://firestore.googleapis.com/v1/projects/${EDITOR_PROJECT}/databases/${EDITOR_DATABASE}/documents/questions`;
  const out: RawDoc[] = [];
  let pageToken = "";
  for (;;) {
    const url = `${base}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const body = await withRetry(async () => {
      const r = await ufetch(url, { headers: { Authorization: `Bearer ${token}` }, dispatcher });
      if (r.status === 401 || r.status === 403 || r.status === 404) throw new NonRetryable(`Firestore REST ${r.status}: ${(await r.text()).slice(0, 300)}`);
      if (!r.ok) throw new Error(`Firestore REST ${r.status}`);
      return (await r.json()) as { documents?: { name: string; fields?: Record<string, FsValue> }[]; nextPageToken?: string };
    }, 5, 800, "firestore page");
    for (const d of body.documents ?? []) {
      const id = d.name.split("/").pop()!;
      out.push({ ...fromFsFields(d.fields ?? {}), id: String((fromFsFields(d.fields ?? {}) as RawDoc).id ?? id), docId: id } as RawDoc);
    }
    log(`  fetched ${out.length} docs…`);
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return out;
}

// ---------- firebase-admin (gRPC) ----------
export async function fetchViaAdmin(sa: ServiceAccount): Promise<RawDoc[]> {
  const { initializeApp, cert, getApps } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = getApps().find((a) => a.name === "editor") ?? initializeApp({ credential: cert(sa as never), projectId: EDITOR_PROJECT }, "editor");
  const db = getFirestore(app, EDITOR_DATABASE);
  const snap = await db.collection("questions").get();
  const conv = (v: unknown): unknown => {
    if (v && typeof v === "object") {
      if (typeof (v as { toDate?: unknown }).toDate === "function") return (v as { toDate(): Date }).toDate().toISOString();
      if (Array.isArray(v)) return v.map(conv);
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, conv(x)]));
    }
    return v;
  };
  return snap.docs.map((d) => ({ ...(conv(d.data()) as object), id: d.id }) as RawDoc);
}

// ---------- figures ----------
const EXT_BY_TYPE: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif" };

export function existingFigure(dir: string, id: string): string | null {
  const stem = sanitizeId(id);
  if (!fs.existsSync(dir)) return null;
  const hit = fs.readdirSync(dir).find((f) => f.startsWith(stem + ".") && !f.endsWith(".part"));
  return hit ? path.join(dir, hit) : null;
}

export async function downloadFigures(docs: RawDoc[], grade: Grade, log = console.log, concurrency = 6) {
  const dir = rawFiguresDir(grade);
  fs.mkdirSync(dir, { recursive: true });
  const dispatcher = makeDispatcher();
  const todo = docs.filter((d) => typeof d.figure_url === "string" && /^https:\/\//.test(d.figure_url));
  // Which URL each cached figure came from: a re-cropped figure gets a new URL in the editor, so a changed URL means
  // the cached file is stale and is downloaded again.
  const manifestFile = path.join(dir, ".sources.json");
  const manifest: Record<string, string> = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf8")) : {};
  let done = 0, skipped = 0;
  const failed: { id: string; error: string }[] = [];
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const d = todo[next++];
      const cached = existingFigure(dir, d.id);
      if (cached && manifest[d.id] === d.figure_url) { skipped++; continue; }
      try {
        await withRetry(async () => {
          const r = await ufetch(d.figure_url, { dispatcher });
          if (r.status === 404) throw new NonRetryable("404");
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const ct = (r.headers.get("content-type") ?? "").split(";")[0];
          const urlExt = path.extname(new URL(d.figure_url).pathname).slice(1).toLowerCase();
          const ext = EXT_BY_TYPE[ct] ?? (urlExt || "png");
          const buf = Buffer.from(await r.arrayBuffer());
          const file = path.join(dir, `${sanitizeId(d.id)}.${ext}`);
          fs.writeFileSync(file + ".part", buf);
          if (cached && cached !== file) fs.rmSync(cached, { force: true });
          fs.renameSync(file + ".part", file);
          manifest[d.id] = d.figure_url;
        }, 5, 700, `figure ${d.id}`);
        done++;
      } catch (e) { failed.push({ id: d.id, error: (e as Error).message }); }
      if ((done + skipped + failed.length) % 50 === 0) log(`  figures: ${done + skipped + failed.length}/${todo.length}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 0));
  return { total: todo.length, downloaded: done, skipped, failed };
}

/**
 * Read an editor "Export JSON" file (or any dump of the questions collection) without credentials.
 * Accepts: an array of docs, {questions: [...]}, {questions: {id: doc}}, or a plain {id: doc} map.
 * Docs without `id` take it from their map key or `source_id` + `year`.
 */
export function docsFromExport(data: unknown): RawDoc[] {
  const body = (data && typeof data === "object" && !Array.isArray(data) && "questions" in data)
    ? (data as { questions: unknown }).questions
    : data;
  const entries: [string | undefined, unknown][] = Array.isArray(body)
    ? body.map((d) => [undefined, d])
    : body && typeof body === "object" ? Object.entries(body as Record<string, unknown>) : [];
  const docs: RawDoc[] = [];
  for (const [key, d] of entries) {
    if (!d || typeof d !== "object") continue;
    const r = d as Record<string, unknown>;
    const id = (r.id as string) ?? key ?? (r.source_id && r.year ? `${r.year}_${r.source_id}` : undefined);
    if (!id || !("question" in r || "question_type" in r)) continue;
    docs.push({ ...r, id: String(id) });
  }
  return docs;
}

export async function runSync(
  grade: Grade,
  o: { mode?: "auto" | "rest" | "admin"; skipFigures?: boolean; fromFile?: string } = {},
  log = console.log,
) {
  let docs: RawDoc[];
  if (o.fromFile) {
    docs = docsFromExport(JSON.parse(fs.readFileSync(o.fromFile, "utf8")));
    log(`Read ${docs.length} question docs from export file ${o.fromFile}`);
  } else {
    docs = await fetchLive(log, o.mode ?? "auto");
  }
  writeSnapshot(grade, docs, o.fromFile ? `file:${path.basename(o.fromFile)}` : EDITOR_PROJECT, log);
  if (!o.skipFigures) {
    const f = await downloadFigures(docs, grade, log);
    log(`Figures: ${f.downloaded} downloaded, ${f.skipped} already present, ${f.failed.length} failed (of ${f.total})`);
    for (const x of f.failed.slice(0, 10)) log(`  failed ${x.id}: ${x.error}`);
  }
}

async function fetchLive(log: typeof console.log, mode: "auto" | "rest" | "admin"): Promise<RawDoc[]> {
  const sa = loadCredentials(); // throws CredentialsError before any network
  log(`Syncing ${EDITOR_PROJECT} (database "${EDITOR_DATABASE}") collection "questions" [${mode}]${process.env.HTTPS_PROXY ? " via HTTPS_PROXY" : ""}`);
  let docs: RawDoc[];
  if (mode === "admin") docs = await fetchViaAdmin(sa);
  else if (mode === "rest") docs = await fetchViaRest(sa, log);
  else {
    try { docs = await fetchViaRest(sa, log); } catch (e) {
      log(`REST path failed (${(e as Error).message}); falling back to firebase-admin (gRPC)…`);
      docs = await fetchViaAdmin(sa);
    }
  }
  if (docs.length === 0) log(`WARNING: 0 documents. Check the database id: it must be "${EDITOR_DATABASE}" (not "(default)") and the collection "questions".`);
  return docs;
}

function writeSnapshot(grade: Grade, docs: RawDoc[], source: string, log: typeof console.log) {
  docs.sort((a, b) => (a.id < b.id ? -1 : 1));
  fs.mkdirSync(rawDir(grade), { recursive: true });
  fs.writeFileSync(snapshotPath(grade), JSON.stringify({ grade, project: source, database: EDITOR_DATABASE, fetchedAt: new Date().toISOString(), count: docs.length, questions: docs }));
  log(`Wrote ${docs.length} docs → ${snapshotPath(grade)}`);
}
