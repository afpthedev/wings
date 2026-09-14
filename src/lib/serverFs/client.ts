export interface FsItem {
  name: string;
  path: string; // relative to workspace root e.g. "my-project/data"
  isDirectory: boolean;
  size: number;
  mtime: number;
  extension: string;
  children?: FsItem[];
}

export interface ProjectTemplate {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  folders: string[];
  files: { path: string; content: string }[];
}

export interface ServerFileContent {
  content: string;
  isBinary: boolean;
  mimeType: string;
  size: number;
  mtime: number;
  path: string;
  name: string;
}

const API_BASE = "/api/fs";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    let errMessage = `Server request failed with status ${res.status}`;
    try {
      const errData = await res.json();
      if (errData.error) errMessage = errData.error;
    } catch {
      // Ignore JSON parse error
    }
    throw new Error(errMessage);
  }
  return res.json() as Promise<T>;
}

export async function getServerTree(path: string = ""): Promise<{ items: FsItem[]; root: string }> {
  const q = path ? `?path=${encodeURIComponent(path)}` : "";
  const data = await request<{ success: boolean; items: FsItem[]; root: string }>(`${API_BASE}/tree${q}`);
  return { items: data.items || [], root: data.root || "" };
}

export async function getServerTemplates(): Promise<ProjectTemplate[]> {
  const data = await request<{ success: boolean; templates: ProjectTemplate[] }>(`${API_BASE}/templates`);
  return data.templates || [];
}

export async function readServerFile(path: string): Promise<ServerFileContent> {
  const data = await request<{ success: boolean } & ServerFileContent>(
    `${API_BASE}/read?path=${encodeURIComponent(path)}`
  );
  return data;
}

export async function writeServerFile(
  path: string,
  content: string,
  isBase64: boolean = false
): Promise<{ path: string; size: number }> {
  const data = await request<{ success: boolean; path: string; size: number }>(`${API_BASE}/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content, isBase64 }),
  });
  return { path: data.path, size: data.size };
}

export async function createServerItem(
  path: string,
  isDirectory: boolean
): Promise<{ path: string; isDirectory: boolean }> {
  const data = await request<{ success: boolean; path: string; isDirectory: boolean }>(`${API_BASE}/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, isDirectory }),
  });
  return { path: data.path, isDirectory: data.isDirectory };
}

export async function createServerProject(
  projectName: string,
  templateId: string,
  customFolders: string[] = []
): Promise<{
  projectName: string;
  projectPath: string;
  template: string;
  foldersCreated: string[];
  filesCreated: string[];
}> {
  const data = await request<any>(`${API_BASE}/create-project`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectName, templateId, customFolders }),
  });
  return data;
}

export async function downloadServerUrl(
  url: string,
  targetFolder: string = "",
  customFileName?: string
): Promise<{ savedPath: string; filename: string; size: number }> {
  const data = await request<{ success: boolean; savedPath: string; filename: string; size: number }>(
    `${API_BASE}/download-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, targetFolder, customFileName }),
    }
  );
  return { savedPath: data.savedPath, filename: data.filename, size: data.size };
}

export async function renameServerItem(
  oldPath: string,
  newPath: string
): Promise<{ oldPath: string; newPath: string }> {
  const data = await request<{ success: boolean; oldPath: string; newPath: string }>(`${API_BASE}/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldPath, newPath }),
  });
  return { oldPath: data.oldPath, newPath: data.newPath };
}

export async function deleteServerItem(path: string): Promise<{ path: string }> {
  const data = await request<{ success: boolean; path: string }>(`${API_BASE}/delete`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  return { path: data.path };
}

export async function uploadServerFiles(
  targetFolder: string,
  fileList: FileList | File[]
): Promise<{ uploadedCount: number; uploaded: string[] }> {
  const files: { name: string; contentBase64: string }[] = [];

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const base64 = await fileToBase64(file);
    files.push({ name: file.name, contentBase64: base64 });
  }

  const data = await request<{ success: boolean; uploadedCount: number; uploaded: string[] }>(
    `${API_BASE}/upload`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetFolder, files }),
    }
  );
  return data;
}

export function getServerZipUrl(path: string = ""): string {
  return `${API_BASE}/download-zip?path=${encodeURIComponent(path)}`;
}

export function getServerFileRawUrl(path: string): string {
  return `${API_BASE}/raw?path=${encodeURIComponent(path)}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const base64 = res.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}
