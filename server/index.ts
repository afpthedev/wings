import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { handleFsApi } from "./apiRouter.ts";
import { getWorkspaceRoot } from "./fsService.ts";
import { initScheduler } from "./schedulerService.ts";

const PORT = parseInt(process.env.PORT || "8080", 10);
const DIST_DIR = path.resolve(process.cwd(), "dist");

const MIME_MAP: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = http.createServer(async (req, res) => {
  // 1. Check if it is a File System API call
  const handled = await handleFsApi(req, res);
  if (handled) return;

  // 2. Serve static files from dist/ (in production)
  const reqPath = (req.url || "/").split("?")[0];
  let filePath = path.join(DIST_DIR, reqPath);

  // Prevent escaping dist/
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // Check if direct file exists
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_MAP[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // 3. Fallback to index.html for client-side routing (SPA)
  const indexPath = path.join(DIST_DIR, "index.html");
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { "Content-Type": "text/html" });
    fs.createReadStream(indexPath).pipe(res);
    return;
  }

  // If dist not yet built
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Wings production build not found in dist/. Run 'npm run build' first.");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Wings Server] Running on http://0.0.0.0:${PORT}`);
  console.log(`[Wings Server] Workspace directory: ${getWorkspaceRoot()}`);
  initScheduler();
});
