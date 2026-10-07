// Local backend for end-to-end tests against the Firebase emulators (auth + firestore):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-p6-math \
//     node backend/netlify/dev-server.mjs        → http://127.0.0.1:8888/api/<name>
import http from "node:http";
import { handleApi, handleRevenueCat, nightly } from "./handler.mjs";

const PORT = Number(process.env.PORT ?? 8888);
http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const url = `http://127.0.0.1:${PORT}${req.url}`;
  const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD", "OPTIONS"].includes(req.method) ? undefined : Buffer.concat(chunks) });
  let response;
  if (req.url.startsWith("/api/")) response = await handleApi(request);
  else if (req.url === "/revenuecat") response = await handleRevenueCat(request);
  else if (req.url === "/nightly" && req.method === "POST") { await nightly(); response = new Response("ok"); }
  else response = new Response("not found", { status: 404 });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, "127.0.0.1", () => console.log(`backend on http://127.0.0.1:${PORT}`));
