import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import AdmZip from "adm-zip";
import { PROJECT_TEMPLATES, resolveTemplate } from "./projectTemplates.ts";

/**
 * Sandboxed workspace root.
 * Defaults to ./workspace in the project root or process.env.WORKSPACE_DIR.
 */
export function getWorkspaceRoot(): string {
  const envDir = process.env.WORKSPACE_DIR;
  const root = envDir ? path.resolve(envDir) : path.resolve(process.cwd(), "workspace");
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  return root;
}

/**
 * Safely resolves a relative path against WORKSPACE_ROOT and guarantees
 * it does not escape the sandbox (path traversal protection).
 */
export function resolveSafePath(relPath: string = ""): string {
  const root = getWorkspaceRoot();
  // Normalize forward/back slashes
  const cleanRel = relPath.replace(/^(\/|\\)+/, "");
  const resolved = path.resolve(root, cleanRel);

  // Check if resolved path starts with root
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Access Denied: Path escapes workspace sandbox");
  }

  return resolved;
}

export interface FsItem {
  name: string;
  path: string; // relative path using '/'
  isDirectory: boolean;
  size: number;
  mtime: number;
  extension: string;
  children?: FsItem[];
}

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json", "js", "jsx", "ts", "tsx", "py", "pyw",
  "html", "htm", "css", "scss", "sass", "less", "sql", "sh", "bash", "zsh",
  "yaml", "yml", "xml", "csv", "tsv", "bib", "env", "gitignore", "dockerignore",
  "c", "cpp", "h", "hpp", "rs", "go", "java", "kt", "r", "lua", "toml", "ini", "conf",
]);

const MIME_MAP: Record<string, string> = {
  md: "text/markdown",
  txt: "text/plain",
  json: "application/json",
  js: "text/javascript",
  ts: "text/typescript",
  py: "text/x-python",
  html: "text/html",
  css: "text/css",
  csv: "text/csv",
  bib: "text/x-bibtex",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  pdf: "application/pdf",
  zip: "application/zip",
  tar: "application/x-tar",
  gz: "application/gzip",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
};

export function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  return MIME_MAP[ext] || (TEXT_EXTENSIONS.has(ext) ? "text/plain" : "application/octet-stream");
}

export function isTextFile(fileName: string): boolean {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (!ext && (fileName.startsWith(".") || fileName === "Makefile" || fileName === "Dockerfile" || fileName === "LICENSE")) return true;
  return false;
}

/**
 * Recursively scans directory and returns tree structure.
 */
export function getTree(subPath: string = ""): FsItem[] {
  const absPath = resolveSafePath(subPath);
  const root = getWorkspaceRoot();

  if (!fs.existsSync(absPath)) return [];

  const entries = fs.readdirSync(absPath, { withFileTypes: true });

  const items: FsItem[] = [];

  for (const entry of entries) {
    // Skip hidden files like .git
    if (entry.name === ".git") continue;

    const fullPath = path.join(absPath, entry.name);
    const relFromRoot = path.relative(root, fullPath).replace(/\\/g, "/");
    const isDir = entry.isDirectory();
    const ext = isDir ? "" : path.extname(entry.name).slice(1).toLowerCase();

    let size = 0;
    let mtime = 0;
    try {
      const stat = fs.statSync(fullPath);
      size = stat.size;
      mtime = stat.mtimeMs;
    } catch {
      // Ignore stat error
    }

    const item: FsItem = {
      name: entry.name,
      path: relFromRoot,
      isDirectory: isDir,
      size,
      mtime,
      extension: ext,
    };

    if (isDir) {
      item.children = getTree(relFromRoot);
    }

    items.push(item);
  }

  // Sort directories first, then alphabetically
  items.sort((a, b) => {
    if (a.isDirectory === b.isDirectory) {
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
    return a.isDirectory ? -1 : 1;
  });

  return items;
}

/**
 * Reads file content.
 */
export function readFile(relPath: string) {
  const absPath = resolveSafePath(relPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${relPath}`);
  }

  const stat = fs.statSync(absPath);
  if (stat.isDirectory()) {
    throw new Error(`Path is a directory: ${relPath}`);
  }

  const mimeType = getMimeType(absPath);
  const text = isTextFile(absPath);

  if (text) {
    const content = fs.readFileSync(absPath, "utf8");
    return {
      content,
      isBinary: false,
      mimeType,
      size: stat.size,
      mtime: stat.mtimeMs,
      path: relPath.replace(/\\/g, "/"),
      name: path.basename(absPath),
    };
  }

  const buffer = fs.readFileSync(absPath);
  return {
    content: buffer.toString("base64"),
    isBinary: true,
    mimeType,
    size: stat.size,
    mtime: stat.mtimeMs,
    path: relPath.replace(/\\/g, "/"),
    name: path.basename(absPath),
  };
}

/**
 * Writes or saves file content to workspace.
 */
export function writeFile(relPath: string, content: string, isBase64: boolean = false) {
  const absPath = resolveSafePath(relPath);
  const dir = path.dirname(absPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (isBase64) {
    const buffer = Buffer.from(content, "base64");
    fs.writeFileSync(absPath, buffer);
  } else {
    fs.writeFileSync(absPath, content, "utf8");
  }

  const stat = fs.statSync(absPath);
  return {
    path: relPath.replace(/\\/g, "/"),
    size: stat.size,
    mtime: stat.mtimeMs,
  };
}

/**
 * Creates a new file or folder.
 */
export function createItem(relPath: string, isDirectory: boolean) {
  const absPath = resolveSafePath(relPath);

  if (fs.existsSync(absPath)) {
    throw new Error(`Item already exists: ${relPath}`);
  }

  if (isDirectory) {
    fs.mkdirSync(absPath, { recursive: true });
  } else {
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(absPath, "", "utf8");
  }

  return { path: relPath.replace(/\\/g, "/"), isDirectory };
}

/**
 * Deletes a file or directory.
 */
export function deleteItem(relPath: string) {
  const absPath = resolveSafePath(relPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Item not found: ${relPath}`);
  }

  fs.rmSync(absPath, { recursive: true, force: true });
  return { path: relPath.replace(/\\/g, "/") };
}

/**
 * Renames or moves a file or directory.
 */
export function renameItem(oldRelPath: string, newRelPath: string) {
  const oldAbs = resolveSafePath(oldRelPath);
  const newAbs = resolveSafePath(newRelPath);

  if (!fs.existsSync(oldAbs)) {
    throw new Error(`Source not found: ${oldRelPath}`);
  }

  if (fs.existsSync(newAbs)) {
    throw new Error(`Destination already exists: ${newRelPath}`);
  }

  const newDir = path.dirname(newAbs);
  if (!fs.existsSync(newDir)) {
    fs.mkdirSync(newDir, { recursive: true });
  }

  fs.renameSync(oldAbs, newAbs);
  return {
    oldPath: oldRelPath.replace(/\\/g, "/"),
    newPath: newRelPath.replace(/\\/g, "/"),
  };
}

/**
 * Creates a project using one of the templates (Academic, Data Science, Software, Book, Course, Blank).
 */
export function createProject(projectName: string, templateId: string, customFolders: string[] = []) {
  const sanitized = projectName.trim().replace(/[^a-zA-Z0-9_\-\s]/g, "").replace(/\s+/g, "-");
  if (!sanitized) {
    throw new Error("Invalid project name");
  }

  const projectRootRel = sanitized;
  const projectRootAbs = resolveSafePath(projectRootRel);

  if (fs.existsSync(projectRootAbs)) {
    throw new Error(`Project folder already exists: ${sanitized}`);
  }

  fs.mkdirSync(projectRootAbs, { recursive: true });

  const template = resolveTemplate(templateId);

  // Combine template folders with user custom folders
  const allFolders = new Set([...template.folders, ...customFolders.map(f => f.trim()).filter(Boolean)]);

  for (const folder of allFolders) {
    const folderAbs = path.join(projectRootAbs, folder);
    fs.mkdirSync(folderAbs, { recursive: true });
  }

  // Create initial template files
  for (const file of template.files) {
    const fileAbs = path.join(projectRootAbs, file.path);
    const parentDir = path.dirname(fileAbs);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(fileAbs, file.content, "utf8");
  }

  return {
    projectName: sanitized,
    projectPath: sanitized,
    template: template.name,
    foldersCreated: Array.from(allFolders),
    filesCreated: template.files.map(f => f.path),
  };
}

/**
 * Normalizes Google Drive share link to direct download link.
 */
export function normalizeDownloadUrl(rawUrl: string): { url: string; isGoogleDrive: boolean } {
  const trimmed = rawUrl.trim();

  // Pattern: https://drive.google.com/file/d/FILE_ID/view...
  const match1 = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match1 && match1[1]) {
    return {
      url: `https://drive.usercontent.google.com/download?id=${match1[1]}&export=download&confirm=t`,
      isGoogleDrive: true,
    };
  }

  // Pattern: https://drive.google.com/open?id=FILE_ID
  const match2 = trimmed.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (match2 && match2[1]) {
    return {
      url: `https://drive.usercontent.google.com/download?id=${match2[1]}&export=download&confirm=t`,
      isGoogleDrive: true,
    };
  }

  // Pattern: https://drive.google.com/uc?id=FILE_ID
  const match3 = trimmed.match(/drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/);
  if (match3 && match3[1]) {
    return {
      url: `https://drive.usercontent.google.com/download?id=${match3[1]}&export=download&confirm=t`,
      isGoogleDrive: true,
    };
  }

  return { url: trimmed, isGoogleDrive: false };
}

/**
 * Downloads a file from URL (including Google Drive) directly onto server disk.
 */
export function downloadFromUrl(
  rawUrl: string,
  targetFolder: string = "",
  customFileName?: string
): Promise<{ savedPath: string; filename: string; size: number }> {
  return new Promise((resolve, reject) => {
    const { url: finalUrl } = normalizeDownloadUrl(rawUrl);

    function fetchWithRedirect(currentUrl: string, redirectCount: number = 0) {
      if (redirectCount > 10) {
        return reject(new Error("Too many HTTP redirects"));
      }

      let parsed: URL;
      try {
        parsed = new URL(currentUrl);
      } catch {
        return reject(new Error(`Invalid URL: ${currentUrl}`));
      }

      const client = parsed.protocol === "https:" ? https : http;

      const req = client.get(
        currentUrl,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) WingsServer/1.0",
            Accept: "*/*",
          },
        },
        (res) => {
          // Handle HTTP redirects
          if (
            res.statusCode &&
            [301, 302, 303, 307, 308].includes(res.statusCode) &&
            res.headers.location
          ) {
            const nextUrl = new URL(res.headers.location, currentUrl).toString();
            return fetchWithRedirect(nextUrl, redirectCount + 1);
          }

          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Download failed with HTTP status ${res.statusCode}`));
          }

          // Determine filename
          let determinedName = customFileName?.trim();
          if (!determinedName) {
            // Check Content-Disposition header
            const disp = res.headers["content-disposition"];
            if (disp) {
              const filenameMatch = disp.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
              if (filenameMatch && filenameMatch[1]) {
                determinedName = decodeURIComponent(filenameMatch[1]);
              }
            }
          }

          if (!determinedName) {
            // Extract from URL pathname
            const base = path.basename(parsed.pathname);
            if (base && !base.includes("?")) {
              determinedName = decodeURIComponent(base);
            }
          }

          if (!determinedName || determinedName === "/" || determinedName.length < 2) {
            determinedName = `download_${Date.now()}`;
          }

          // Target path on disk
          const targetDirAbs = resolveSafePath(targetFolder);
          if (!fs.existsSync(targetDirAbs)) {
            fs.mkdirSync(targetDirAbs, { recursive: true });
          }

          const fileAbs = path.join(targetDirAbs, determinedName);
          const fileStream = fs.createWriteStream(fileAbs);

          let downloadedBytes = 0;
          res.on("data", (chunk) => {
            downloadedBytes += chunk.length;
          });

          res.pipe(fileStream);

          fileStream.on("finish", () => {
            fileStream.close();
            const relSaved = path.relative(getWorkspaceRoot(), fileAbs).replace(/\\/g, "/");
            resolve({
              savedPath: relSaved,
              filename: determinedName!,
              size: downloadedBytes,
            });
          });

          fileStream.on("error", (err) => {
            fs.unlink(fileAbs, () => {});
            reject(err);
          });
        }
      );

      req.on("error", (err) => reject(err));
      req.setTimeout(60000, () => {
        req.destroy(new Error("Download request timed out (60s)"));
      });
    }

    fetchWithRedirect(finalUrl, 0);
  });
}

/**
 * Creates a ZIP buffer of a folder or file in the workspace.
 */
export function createZip(relPath: string = ""): { buffer: Buffer; filename: string } {
  const absPath = resolveSafePath(relPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Target not found: ${relPath}`);
  }

  const zip = new AdmZip();
  const stat = fs.statSync(absPath);
  const baseName = path.basename(absPath) || "workspace";

  if (stat.isDirectory()) {
    zip.addLocalFolder(absPath, "");
  } else {
    zip.addLocalFile(absPath);
  }

  const buffer = zip.toBuffer();
  return {
    buffer,
    filename: `${baseName}.zip`,
  };
}
