// Serves dist/ like the static host will: /quiz → quiz.html, /ru/ → ru/index.html.
//   node scripts/serve.mjs [port]
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const PORT = Number(process.argv[2] ?? 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function locate(pathname) {
  const base = join(DIST, normalize(decodeURIComponent(pathname)));
  if (!base.startsWith(DIST)) return null;
  const tries = [base, `${base}.html`, join(base, "index.html")];
  return tries.find((f) => existsSync(f) && statSync(f).isFile()) ?? null;
}

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  const file = locate(pathname);
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    return;
  }
  // Compress text the way the static host will, so local Lighthouse numbers mean something.
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  const accept = String(req.headers["accept-encoding"] ?? "");
  let body = readFileSync(file);
  const headers = { "content-type": type, "cache-control": "no-store" };
  if (/text|json|javascript|svg/.test(type)) {
    if (accept.includes("br")) {
      body = brotliCompressSync(body);
      headers["content-encoding"] = "br";
    } else if (accept.includes("gzip")) {
      body = gzipSync(body);
      headers["content-encoding"] = "gzip";
    }
  }
  res.writeHead(200, headers);
  res.end(body);
}).listen(PORT, "127.0.0.1", () => console.log(`http://127.0.0.1:${PORT}/`));
