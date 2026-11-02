// After `tsc`: copy lib/ into netlify/lib (what the Netlify function imports).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
fs.rmSync(path.join(root, "netlify/lib"), { recursive: true, force: true });
fs.cpSync(path.join(root, "lib"), path.join(root, "netlify/lib"), { recursive: true });
console.log("copied lib → netlify/lib");
