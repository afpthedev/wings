import { AgentTool } from "./types";
import {
  createServerProject,
  writeServerFile,
  readServerFile,
  downloadServerUrl,
  getServerTree,
} from "@/lib/serverFs/client";
import { createEntry, updateEntry, getEntryTitle } from "@/lib/journal";
import { payloadFromMarkdown } from "@/lib/entryContent";

export const createProjectWorkspaceTool: AgentTool<{
  projectName: string;
  template?: string;
  createLinkedPage?: boolean;
  linkToPageId?: string;
}> = {
  name: "create_project_workspace",
  description:
    "Create a project workspace on the Contabo server disk with standardized scaffolding (e.g. data/, plots/, papers/, notebooks/ for academic_research), and optionally link it to a Wings note.",
  parameters: {
    type: "object",
    properties: {
      projectName: {
        type: "string",
        description: "Name of the project directory to create on the server (e.g. 'Ahmet 123', 'thesis-experiment').",
      },
      template: {
        type: "string",
        enum: [
          "academic_research",
          "data_science",
          "software_dev",
          "book_writing",
          "course_prep",
          "blank",
        ],
        description:
          "Scaffolding template. Use 'academic_research' for research with data/plots/papers, 'data_science' for ML/AI, 'software_dev' for coding.",
      },
      createLinkedPage: {
        type: "boolean",
        description: "Whether to also create a companion Wings note/project page linked to this workspace. Defaults to true.",
      },
      linkToPageId: {
        type: "string",
        description: "Optional existing page ID to attach this workspace to instead of creating a new page.",
      },
    },
    required: ["projectName"],
  },
  async execute({ projectName, template = "academic_research", createLinkedPage = true, linkToPageId }, context) {
    // 1. Create project on server disk
    const result = await createServerProject(projectName, template);

    let linkedPageId = linkToPageId;
    let pageTitle = projectName;

    // 2. Link or create companion page in Wings
    if (linkToPageId) {
      const existing = context.allEntries.find((e) => e.id === linkToPageId);
      if (existing) {
        pageTitle = getEntryTitle(existing);
        const curContent = existing.content || "";
        const banner = `> 📁 **Server Workspace:** \`${projectName}\` (Template: ${template})\n\n`;
        const nextContent = `${banner}${curContent}`;
        const payload = payloadFromMarkdown(nextContent);
        await updateEntry(existing.id, payload);
        const updated = { ...existing, content: payload.markdown, content_json: payload.json };
        const idx = context.allEntries.findIndex((e) => e.id === existing.id);
        if (idx !== -1) context.allEntries[idx] = updated;
        if (context.onUpdateEntry) await context.onUpdateEntry(updated, nextContent);
      }
    } else if (createLinkedPage) {
      const ownerId = context.userId || "anonymous";
      let md = `# ${projectName}\n\n`;
      md += `> 📁 **Server Workspace:** \`${projectName}\`\n`;
      md += `> **Template:** \`${template}\`\n\n`;

      if (template === "academic_research") {
        md += `### 📂 Workspace Folders:\n`;
        md += `- \`data/\`: Raw and processed datasets\n`;
        md += `- \`plots/\`: Generated visualizations and figures\n`;
        md += `- \`papers/\`: PDF literature and reference documents\n`;
        md += `- \`notebooks/\`: Jupyter experiments and analysis\n\n`;
      } else if (template === "data_science") {
        md += `### 📂 Workspace Folders:\n`;
        md += `- \`data/raw/\`: Immutable raw data\n`;
        md += `- \`data/processed/\`: Cleaned feature sets\n`;
        md += `- \`models/\`: Trained checkpoints\n`;
        md += `- \`notebooks/\`: Exploratory data analysis\n\n`;
      }

      md += `## 🎯 Objectives & Hypotheses\n\n- \n\n## 📝 Project Log\n\n- [ ] Initial setup and dataset collection #p1\n`;

      const newPage = await createEntry(ownerId, md, { title: projectName });
      context.onCreateEntry(newPage);
      linkedPageId = newPage.id;
    }

    return {
      success: true,
      projectName,
      template,
      folderCount: result.createdFolders?.length ?? 0,
      fileCount: result.createdFiles?.length ?? 0,
      linkedPageId,
      message: `Created server workspace "${projectName}" with ${template} template${linkedPageId ? ` and linked to page "${pageTitle}"` : ""}.`,
    };
  },
};

export const writeServerFileTool: AgentTool<{
  filePath: string;
  content: string;
}> = {
  name: "write_server_file",
  description:
    "Create or update a file in the server workspace (e.g. Python scripts, config.json, notes.md, bash scripts).",
  parameters: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Relative file path inside the workspace (e.g. 'Ahmet 123/src/train.py', 'Ahmet 123/config.json').",
      },
      content: {
        type: "string",
        description: "Full content to write to the file.",
      },
    },
    required: ["filePath", "content"],
  },
  async execute({ filePath, content }) {
    const res = await writeServerFile(filePath, content);
    return {
      success: true,
      filePath,
      size: res.size,
      message: `Wrote file "${filePath}" (${res.size} bytes).`,
    };
  },
};

export const readServerFileTool: AgentTool<{
  filePath: string;
}> = {
  name: "read_server_file",
  description: "Read the content of a text/code file from the server workspace.",
  parameters: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Path to the file to read (e.g. 'Ahmet 123/README.md', 'Ahmet 123/src/main.py').",
      },
    },
    required: ["filePath"],
  },
  async execute({ filePath }) {
    const file = await readServerFile(filePath);
    if (file.isBinary) {
      return {
        filePath,
        isBinary: true,
        size: file.size,
        message: "File is binary (image or data blob). Cannot render as plain text.",
      };
    }
    return {
      filePath,
      size: file.size,
      name: file.name,
      content: file.content,
    };
  },
};

export const downloadToWorkspaceTool: AgentTool<{
  url: string;
  targetDir: string;
  filename?: string;
}> = {
  name: "download_to_workspace",
  description:
    "Download a file from Google Drive or a direct URL into a specific directory in the server workspace.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Google Drive share link or direct HTTP download URL.",
      },
      targetDir: {
        type: "string",
        description: "Target directory inside the workspace (e.g. 'Ahmet 123/data', 'Ahmet 123/papers').",
      },
      filename: {
        type: "string",
        description: "Optional filename to save as. If omitted, extracted from URL or content-disposition.",
      },
    },
    required: ["url", "targetDir"],
  },
  async execute({ url, targetDir, filename }) {
    const res = await downloadServerUrl(url, targetDir, filename);
    return {
      success: true,
      targetPath: res.savedPath,
      filename: res.filename,
      size: res.size,
      message: `Successfully downloaded "${res.filename}" into "${targetDir}".`,
    };
  },
};

export const listWorkspaceFilesTool: AgentTool<{
  path?: string;
}> = {
  name: "list_workspace_files",
  description: "List files and subfolders in the server workspace.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative folder path (e.g. 'Ahmet 123', 'Ahmet 123/data'). Empty string lists workspace root.",
      },
    },
  },
  async execute({ path = "" }) {
    const tree = await getServerTree(path);
    return {
      path: path || "root",
      itemCount: tree.items.length,
      items: tree.items.map((it) => ({
        name: it.name,
        path: it.path,
        isDirectory: it.isDirectory,
        size: it.size,
      })),
    };
  },
};

export const linkWorkspaceToPageTool: AgentTool<{
  workspacePath: string;
  pageId: string;
}> = {
  name: "link_workspace_to_page",
  description: "Link an existing server workspace directory to a Wings note page.",
  parameters: {
    type: "object",
    properties: {
      workspacePath: {
        type: "string",
        description: "Path of the workspace directory (e.g. 'Ahmet 123').",
      },
      pageId: {
        type: "string",
        description: "ID of the Wings page to link to.",
      },
    },
    required: ["workspacePath", "pageId"],
  },
  async execute({ workspacePath, pageId }, context) {
    const entry = context.allEntries.find((e) => e.id === pageId);
    if (!entry) {
      return { success: false, error: `Page ${pageId} not found.` };
    }

    const cur = entry.content || "";
    const badge = `> 📁 **Server Workspace:** \`${workspacePath}\`\n\n`;
    if (!cur.includes(`\`${workspacePath}\``)) {
      const nextContent = `${badge}${cur}`;
      const payload = payloadFromMarkdown(nextContent);
      await updateEntry(pageId, payload);
      const updated = { ...entry, content: payload.markdown, content_json: payload.json };
      const idx = context.allEntries.findIndex((e) => e.id === pageId);
      if (idx !== -1) context.allEntries[idx] = updated;
      if (context.onUpdateEntry) await context.onUpdateEntry(updated, nextContent);
    }

    return {
      success: true,
      pageId,
      pageTitle: getEntryTitle(entry),
      workspacePath,
      message: `Linked workspace "${workspacePath}" to page "${getEntryTitle(entry)}".`,
    };
  },
};
