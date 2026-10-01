import path from "node:path";
import type { Grade } from "@p6/shared";

export const CONTENT_ROOT = path.resolve(__dirname, "..");
export const REPO_ROOT = path.resolve(CONTENT_ROOT, "..");
export const rawDir = (g: Grade) => path.join(CONTENT_ROOT, "raw", g);
export const snapshotPath = (g: Grade) => path.join(rawDir(g), "questions.snapshot.json");
export const rawFiguresDir = (g: Grade) => path.join(rawDir(g), "figures");
export const reportPath = (g: Grade) => path.join(CONTENT_ROOT, "reports", `${g}-audit.md`);
export const mappingPath = (g: Grade) => path.join(CONTENT_ROOT, "mapping", `${g}-subtopics.csv`);
export const assetsContentRoot = () => path.join(REPO_ROOT, "apps", "mobile", "assets", "content");
export const outDirFor = (g: Grade) => path.join(assetsContentRoot(), g);

/** Safe filename stem from a question id. */
export function sanitizeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^\.+/, "_");
}
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
