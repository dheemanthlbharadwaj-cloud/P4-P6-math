// Local backend on http://127.0.0.1:8899 (emulators only): the same handler as the Netlify function.
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-classroom node scripts/dev-server.mjs
import http from "node:http";
import { createRequire } from "node:module";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("emulators only: set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST");
const { handleApi } = createRequire(import.meta.url)("../lib/handler.js");
const PORT = Number(process.env.PORT || 8899);
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const request = new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
  const r = await handleApi(request);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, "127.0.0.1", () => console.log(`classroom backend on http://127.0.0.1:${PORT}`));
