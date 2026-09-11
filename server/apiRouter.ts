import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import {
  getTree,
  readFile,
  writeFile,
  createItem,
  deleteItem,
  renameItem,
  createProject,
  downloadFromUrl,
  createZip,
  getWorkspaceRoot,
} from "./fsService.ts";
import { PROJECT_TEMPLATES } from "./projectTemplates.ts";
import {
  getSchedulerConfig,
  saveSchedulerConfig,
  triggerMorningBriefing,
  triggerDeadlineAlert,
  triggerWeeklyDigest,
  syncTasksForScheduler,
} from "./schedulerService.ts";
import { listOutboxMessages, getOutboxMessage, getMailProviderStatus } from "./mailService.ts";

function sendJson(res: ServerResponse, statusCode: number, data: unknown) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(json);
}

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      // 50MB limit
      if (body.length > 50 * 1024 * 1024) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", (err) => reject(err));
  });
}

/**
 * Dispatches /api/fs/* requests.
 * Returns true if the request was handled, false otherwise.
 */
export async function handleFsApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const reqUrl = req.url || "/";
  if (!reqUrl.startsWith("/api/fs") && !reqUrl.startsWith("/api/planner")) {
    return false;
  }

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return true;
  }

  const parsedUrl = new URL(reqUrl, "http://localhost");
  const pathname = parsedUrl.pathname;
  const searchParams = parsedUrl.searchParams;

  try {
    // 1. List files & folders tree
    if (pathname === "/api/fs/tree" && req.method === "GET") {
      const subPath = searchParams.get("path") || "";
      const items = getTree(subPath);
      sendJson(res, 200, {
        success: true,
        root: getWorkspaceRoot(),
        items,
      });
      return true;
    }

    // 2. Available project templates
    if (pathname === "/api/fs/templates" && req.method === "GET") {
      const uniqueTemplates = Array.from(
        new Map(Object.values(PROJECT_TEMPLATES).map((tpl) => [tpl.id, tpl])).values()
      );
      sendJson(res, 200, {
        success: true,
        templates: uniqueTemplates,
      });
      return true;
    }

    // 3. Read file content
    if (pathname === "/api/fs/read" && req.method === "GET") {
      const filePath = searchParams.get("path");
      if (!filePath) {
        sendJson(res, 400, { success: false, error: "Missing 'path' parameter" });
        return true;
      }
      const data = readFile(filePath);
      sendJson(res, 200, { success: true, ...data });
      return true;
    }

    // 4. Save file content
    if (pathname === "/api/fs/write" && req.method === "POST") {
      const body = await parseJsonBody(req);
      const { path: filePath, content, isBase64 } = body;
      if (!filePath || content === undefined) {
        sendJson(res, 400, { success: false, error: "Missing 'path' or 'content'" });
        return true;
      }
      const result = writeFile(filePath, content, Boolean(isBase64));
      sendJson(res, 200, { success: true, ...result });
      return true;
    }

    // 5. Create new file or folder
    if (pathname === "/api/fs/create" && req.method === "POST") {
      const body = await parseJsonBody(req);
      const { path: itemPath, isDirectory } = body;
      if (!itemPath) {
        sendJson(res, 400, { success: false, error: "Missing 'path'" });
        return true;
      }
      const result = createItem(itemPath, Boolean(isDirectory));
      sendJson(res, 201, { success: true, ...result });
      return true;
    }

    // 6. Create complete project from template
    if (pathname === "/api/fs/create-project" && req.method === "POST") {
      const body = await parseJsonBody(req);
      const { projectName, templateId, customFolders } = body;
      if (!projectName) {
        sendJson(res, 400, { success: false, error: "Missing 'projectName'" });
        return true;
      }
      const result = createProject(projectName, templateId || "blank", customFolders || []);
      sendJson(res, 201, { success: true, ...result });
      return true;
    }

    // 7. Download from URL / Google Drive directly to server disk
    if (pathname === "/api/fs/download-url" && req.method === "POST") {
      const body = await parseJsonBody(req);
      const { url, targetFolder, customFileName } = body;
      if (!url) {
        sendJson(res, 400, { success: false, error: "Missing 'url'" });
        return true;
      }
      const result = await downloadFromUrl(url, targetFolder || "", customFileName);
      sendJson(res, 200, { success: true, ...result });
      return true;
    }

    // 8. Upload files from browser to server
    if (pathname === "/api/fs/upload" && req.method === "POST") {
      const body = await parseJsonBody(req);
      const { targetFolder = "", files = [] } = body;
      const uploaded: string[] = [];

      for (const file of files) {
        if (!file.name || !file.contentBase64) continue;
        const targetRel = targetFolder ? `${targetFolder}/${file.name}` : file.name;
        writeFile(targetRel, file.contentBase64, true);
        uploaded.push(targetRel);
      }

      sendJson(res, 200, { success: true, uploadedCount: uploaded.length, uploaded });
      return true;
    }

    // 9. Download folder or file as ZIP
    if (pathname === "/api/fs/download-zip" && req.method === "GET") {
      const targetPath = searchParams.get("path") || "";
      const { buffer, filename } = createZip(targetPath);
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length,
        "Access-Control-Allow-Origin": "*",
      });
      res.end(buffer);
      return true;
    }

    // 10. Rename or move
    if (pathname === "/api/fs/rename" && req.method === "POST") {
      const body = await parseJsonBody(req);
      const { oldPath, newPath } = body;
      if (!oldPath || !newPath) {
        sendJson(res, 400, { success: false, error: "Missing 'oldPath' or 'newPath'" });
        return true;
      }
      const result = renameItem(oldPath, newPath);
      sendJson(res, 200, { success: true, ...result });
      return true;
    }

    // 11. Delete
    if (pathname === "/api/fs/delete" && (req.method === "DELETE" || req.method === "POST")) {
      let itemPath = searchParams.get("path");
      if (!itemPath) {
        const body = await parseJsonBody(req);
        itemPath = body.path;
      }
      if (!itemPath) {
        sendJson(res, 400, { success: false, error: "Missing 'path'" });
        return true;
      }
      const result = deleteItem(itemPath);
      sendJson(res, 200, { success: true, ...result });
      return true;
    }

    // -------------------------------------------------------------------------
    // Planner, Cron Scheduler & Email Reminders API
    // -------------------------------------------------------------------------

    // 12. Get planner & scheduler config
    if (pathname === "/api/planner/config" && req.method === "GET") {
      const config = getSchedulerConfig();
      const outbox = listOutboxMessages();
      const providerStatus = getMailProviderStatus();
      sendJson(res, 200, {
        success: true,
        config,
        outboxCount: outbox.length,
        hasResendKey: Boolean(process.env.RESEND_API_KEY),
        providerStatus,
      });
      return true;
    }

    // 13. Update planner & scheduler config
    if (pathname === "/api/planner/config" && req.method === "POST") {
      const body = await parseJsonBody(req);
      const updated = saveSchedulerConfig(body);
      sendJson(res, 200, { success: true, config: updated });
      return true;
    }

    // 14. Sync active tasks to scheduler cache
    if (pathname === "/api/planner/sync-tasks" && req.method === "POST") {
      const body = await parseJsonBody(req);
      syncTasksForScheduler(body.tasks || []);
      sendJson(res, 200, { success: true, count: (body.tasks || []).length });
      return true;
    }

    // 15. Trigger test reminder email immediately
    if (pathname === "/api/planner/send-test" && req.method === "POST") {
      const body = await parseJsonBody(req);
      const { type = "morning_briefing", targetEmail, taskDetails, tasks } = body;
      const email = targetEmail || getSchedulerConfig().targetEmail;

      if (!email) {
        sendJson(res, 400, {
          success: false,
          error: "Please specify a target email address in settings",
        });
        return true;
      }

      let result: any;
      if (type === "deadline_alert") {
        result = await triggerDeadlineAlert(email, taskDetails);
      } else if (type === "weekly_digest") {
        result = await triggerWeeklyDigest(email);
      } else {
        result = await triggerMorningBriefing(email, tasks);
      }

      sendJson(res, 200, { success: true, ...result });
      return true;
    }

    // 16. List outbox messages
    if (pathname === "/api/planner/outbox" && req.method === "GET") {
      const messages = listOutboxMessages();
      sendJson(res, 200, { success: true, messages });
      return true;
    }

    // 17. HTML preview for iframe or browser inspection
    if (pathname === "/api/planner/preview" && req.method === "GET") {
      const id = searchParams.get("id");
      if (!id) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing 'id' parameter");
        return true;
      }
      const msg = getOutboxMessage(id);
      if (!msg) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Message not found");
        return true;
      }
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(msg.html),
      });
      res.end(msg.html);
      return true;
    }

    sendJson(res, 404, { success: false, error: `Endpoint not found: ${pathname}` });
    return true;
  } catch (error: any) {
    sendJson(res, 500, { success: false, error: error?.message || "Internal server error" });
    return true;
  }
}
