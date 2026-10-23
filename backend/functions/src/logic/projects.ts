// Which Firebase projects the backend talks to (pure, so it can be tested). Env vars:
//   STUDENT_SERVICE_ACCOUNT_B64 / STUDENT_DATABASE_ID ("(default)")   student project: Auth + all student data
//   EDITOR_SERVICE_ACCOUNT_B64  / EDITOR_DATABASE_ID  ("default")     editor project: `questions` read, `question_reports` write
//   LEGACY_AUTH_PROJECT_ID                                            also accept ID tokens of this project (transition)
// Without STUDENT_SERVICE_ACCOUNT_B64 everything is the one legacy project: BACKEND_SERVICE_ACCOUNT_B64 +
// FIRESTORE_DATABASE_ID (the editor database id then defaults to that same database).

export interface ServiceAccountJson { project_id: string; client_email: string; private_key: string; [k: string]: unknown }
type Env = Record<string, string | undefined>;

export interface ProjectConfig {
  /** true when the student data lives in its own project */
  split: boolean;
  studentB64?: string;
  studentDatabaseId: string;
  editorB64?: string;
  editorDatabaseId: string;
  legacyB64?: string;
  legacyAuthProjectId?: string;
}

export function resolveProjects(env: Env): ProjectConfig {
  const legacyB64 = env.BACKEND_SERVICE_ACCOUNT_B64 || undefined;
  const legacyDb = env.FIRESTORE_DATABASE_ID || "(default)";
  const studentB64 = env.STUDENT_SERVICE_ACCOUNT_B64 || undefined;
  const legacyAuthProjectId = env.LEGACY_AUTH_PROJECT_ID || undefined;
  if (!studentB64) {
    return { split: false, studentB64: legacyB64, studentDatabaseId: legacyDb, editorB64: legacyB64, editorDatabaseId: env.EDITOR_DATABASE_ID || legacyDb, legacyB64, legacyAuthProjectId };
  }
  return {
    split: true,
    studentB64,
    studentDatabaseId: env.STUDENT_DATABASE_ID || "(default)",
    editorB64: env.EDITOR_SERVICE_ACCOUNT_B64 || legacyB64,
    editorDatabaseId: env.EDITOR_DATABASE_ID || "default",
    legacyB64,
    legacyAuthProjectId,
  };
}

/** Try the student project's verifier; if it rejects and a legacy verifier is configured, try that one. */
export async function verifyWithFallback<T>(primary: (t: string) => Promise<T>, legacy: ((t: string) => Promise<T>) | null, token: string): Promise<T> {
  try {
    return await primary(token);
  } catch (e) {
    if (!legacy) throw e;
    try { return await legacy(token); } catch { throw e; }
  }
}

/** Callables of the teacher and admin dashboards check for revoked / disabled logins on every call; student callables don't (no extra Auth call). */
export const needsRevocationCheck = (callable: string): boolean => /^(admin|teacher)[A-Z]/.test(callable);
