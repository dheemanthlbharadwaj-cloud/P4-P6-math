// Google Cloud REST helpers for the setup/deploy scripts: service-account token, JSON requests that never echo
// response bodies wholesale (only error messages), long-running operations.
import { createSign } from "node:crypto";

/** The service account that administers the student project (Owner), from SETUP_SERVICE_ACCOUNT_B64 or FIREBASE_SERVICE_ACCOUNT_B64. */
export function loadServiceAccount() {
  const b64 = process.env.SETUP_SERVICE_ACCOUNT_B64 || process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!b64) throw new Error("Set SETUP_SERVICE_ACCOUNT_B64 (or FIREBASE_SERVICE_ACCOUNT_B64).");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64u({ alg: "RS256", typ: "JWT" })}.${b64u({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  if (!res.ok) throw new Error(`token: HTTP ${res.status}`);
  return (await res.json()).access_token;
}

export async function googleClient(sa) {
  const TOKEN = await accessToken(sa);

  /** JSON request; returns { status, body }. Error bodies are reduced to their message (never echoed wholesale). */
  async function api(method, url, body, extraHeaders = {}) {
    const res = await fetch(url, {
      method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    return { status: res.status, body: json, error: json?.error?.message };
  }
  const must = (r, what) => { if (r.status >= 300) throw new Error(`${what}: HTTP ${r.status} ${r.error ?? ""}`); return r.body; };

  /** Long-running operation → wait until done. */
  async function wait(opName, base) {
    for (let i = 0; i < 90; i++) {
      const r = must(await api("GET", `${base}/${opName}`), `operation ${opName}`);
      if (r.done) { if (r.error) throw new Error(`${opName}: ${r.error.message}`); return r.response; }
      await new Promise((s) => setTimeout(s, 4000));
    }
    throw new Error(`${opName}: timed out`);
  }
  return { api, must, wait, token: TOKEN };
}
