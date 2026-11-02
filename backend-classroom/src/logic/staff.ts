// Staff rules that need no database: roles, teacher validation, passwords. Pure (Firestore / Auth side: ../staff.ts).
import { randomInt } from "node:crypto";
import type { Fail, Ok } from "../errors.js";

const fail = (code: Fail["code"], message: string): Fail => ({ ok: false, code, message });
export interface StaffDoc { uid: string; name: string; email: string; active: boolean; createdAt: number }

/** getMyRoles: an ACTIVE teacher / admin doc opens that area. Admins can also use the teacher area (staffOf). */
export function rolesOf(teacher: { active?: unknown } | null | undefined, admin: { active?: unknown } | null | undefined): { teacher: boolean; admin: boolean } {
  return { teacher: teacher?.active === true, admin: admin?.active === true };
}
export function checkAdmin(doc: { active?: unknown } | null | undefined): Fail | Ok {
  return doc?.active === true ? { ok: true } : fail("permission-denied", "Not an admin");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validateTeacher(raw: unknown): Fail | Ok<{ email: string; name: string; uid?: string }> {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = typeof d.name === "string" ? d.name.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  const email = typeof d.email === "string" ? d.email.trim().toLowerCase().slice(0, 200) : "";
  if (!name) return fail("invalid-argument", "Enter the teacher's name.");
  if (!EMAIL_RE.test(email)) return fail("invalid-argument", "That is not a valid email address.");
  const uid = typeof d.uid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(d.uid) ? d.uid : undefined;
  return { ok: true, email, name, ...(uid ? { uid } : {}) };
}

const PASSWORD_SETS = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789"]; // no 0/O, 1/l/I
/** 16 readable characters, at least one of each class, from a CSPRNG (injectable for tests). */
export function makePassword(length = 16, rand: (max: number) => number = randomInt): string {
  const all = PASSWORD_SETS.join("");
  const chars = PASSWORD_SETS.map((s) => s[rand(s.length)]);
  while (chars.length < Math.max(16, length)) chars.push(all[rand(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = rand(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}
