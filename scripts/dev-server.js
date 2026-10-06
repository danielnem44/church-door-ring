// Local test server: `npm run dev` → http://localhost:3000
// Serves /public and runs /api/* the same way Vercel does.
// No WhatsApp keys? It runs in MOCK mode and prints messages to this console.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 3000);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json" };

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function handleApi(req, res, url) {
  const name = url.pathname.replace(/^\/api\//, "").replace(/[^a-z0-9_-]/gi, "");
  const file = path.join(root, "api", `${name}.js`);
  let mod;
  try {
    mod = await import(pathToFileURL(file).href);
  } catch {
    res.writeHead(404).end("Not found");
    return;
  }
  const handler = mod[req.method];
  if (!handler) {
    res.writeHead(405).end("Method not allowed");
    return;
  }
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  if (!headers.has("x-forwarded-for")) headers.set("x-forwarded-for", req.socket.remoteAddress || "local");
  const request = new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers, body });
  const response = await handler(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function handleStatic(res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  let file = path.join(root, "public", path.normalize(p));
  if (!file.startsWith(path.join(root, "public"))) return res.writeHead(403).end();
  try {
    await fs.access(file);
  } catch {
    file += ".html"; // cleanUrls, like vercel.json
  }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    try {
      if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
      else await handleStatic(res, url);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500);
      res.end("Server error");
    }
  })
  .listen(PORT, () => {
    console.log(`Church Door Ring running on http://localhost:${PORT}`);
    console.log(`Door sign:  http://localhost:${PORT}/sign`);
    if (!process.env.WHATSAPP_TOKEN) console.log("MOCK mode: no WhatsApp keys, messages are printed here instead.");
  });
