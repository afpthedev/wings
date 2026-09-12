import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/journal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/journal")>();
  return {
    ...actual,
    updateEntry: vi.fn().mockResolvedValue(undefined),
  };
});

import { parseActionBlocks } from "./agentLoop";
import { AGENT_TOOLS_MAP, formatToolsSystemPrompt } from "./registry";
import { searchPagesTool, createTaskTool, updatePageTool } from "./workspaceTools";
import { linkWorkspaceToPageTool } from "./serverFsTools";
import { ToolContext } from "./types";
import { Entry } from "@/lib/journal";

describe("Agent Tools & ReAct Parser", () => {
  it("parses action blocks and strips text cleanly", () => {
    const raw = `I will search for the project Ahmet 123.
\`\`\`action:search_pages
{"query": "Ahmet 123"}
\`\`\`
Let me check the results.`;

    const { stripped, actions } = parseActionBlocks(raw);
    expect(actions.length).toBe(1);
    expect(actions[0].toolName).toBe("search_pages");
    expect(actions[0].args).toEqual({ query: "Ahmet 123" });
    expect(stripped).toContain("I will search for the project Ahmet 123.");
    expect(stripped).toContain("Let me check the results.");
    expect(stripped).not.toContain("```action:search_pages");
  });

  it("contains all required workspace, task, serverFs, and collection tools in registry", () => {
    const required = [
      // Pages
      "search_pages",
      "read_page",
      "create_page",
      "update_page",
      "link_pages",
      // Tasks
      "list_tasks",
      "create_task",
      "update_task",
      // Plans
      "daily_plan",
      "weekly_plan",
      "project_summary",
      // Server FS
      "create_project_workspace",
      "write_server_file",
      "read_server_file",
      "download_to_workspace",
      "list_workspace_files",
      "link_workspace_to_page",
      // Collections
      "list_collections",
      "create_collection",
      "add_to_collection",
    ];

    for (const toolName of required) {
      expect(AGENT_TOOLS_MAP.has(toolName)).toBe(true);
    }

    const prompt = formatToolsSystemPrompt();
    expect(prompt).toContain("## Available Workspace Agent Tools");
    expect(prompt).toContain("create_project_workspace");
    expect(prompt).toContain("download_to_workspace");
    expect(prompt).toContain("create_collection");
  });

  it("executes search_pages tool accurately", async () => {
    const mockEntries: Entry[] = [
      {
        id: "p1",
        user_id: "u1",
        title: "Academic Paper - Ahmet 123",
        content: "Here are research notes and data analysis.",
        parent_id: null,
        created_at: "",
        updated_at: "",
        pinned: false,
      },
      {
        id: "p2",
        user_id: "u1",
        title: "Grocery List",
        content: "Apples, Milk",
        parent_id: null,
        created_at: "",
        updated_at: "",
        pinned: false,
      },
    ];

    const context: ToolContext = {
      allEntries: mockEntries,
      activeEntry: mockEntries[0],
      onCreateEntry: () => {},
      onNavigate: () => {},
    };

    const result = await searchPagesTool.execute({ query: "Ahmet" }, context);
    expect(result.resultsCount).toBe(1);
    expect(result.results[0].id).toBe("p1");
    expect(result.results[0].title).toBe("Academic Paper - Ahmet 123");
  });

  it("executes create_task tool and stores task", async () => {
    localStorage.clear();
    const context: ToolContext = {
      allEntries: [],
      activeEntry: null,
      onCreateEntry: () => {},
      onNavigate: () => {},
    };

    const result = await createTaskTool.execute(
      {
        title: "Clean dataset",
        priority: "p1",
        dueDate: "2026-09-12",
      },
      context
    );

    expect(result.success).toBe(true);
    expect(result.task.title).toBe("Clean dataset");
    expect(result.task.priority).toBe("p1");
  });

  it("executes link_workspace_to_page tool", async () => {
    const mockEntry: Entry = {
      id: "p123",
      user_id: "u1",
      title: "Deep Learning Notes",
      content: "# Deep Learning Notes\nNotes here.",
      parent_id: null,
      created_at: "",
      updated_at: "",
      pinned: false,
    };

    const context: ToolContext = {
      allEntries: [mockEntry],
      activeEntry: mockEntry,
      onCreateEntry: () => {},
      onNavigate: () => {},
    };

    const result = await linkWorkspaceToPageTool.execute(
      {
        workspacePath: "dl-experiments",
        pageId: "p123",
      },
      context
    );

    expect(result.success).toBe(true);
    expect(result.workspacePath).toBe("dl-experiments");
  });

  it("executes update_page tool, updates context entry, and triggers onUpdateEntry callback", async () => {
    const mockEntry: Entry = {
      id: "page-seneca",
      user_id: "u1",
      title: "Mutlu Yaşam Üzerine - Seneca",
      content: "Eski içerik",
      parent_id: null,
      created_at: "",
      updated_at: "",
      pinned: false,
    };

    let updatedEntryReceived: Entry | null = null;
    let updatedContentReceived: string | null = null;

    const context: ToolContext = {
      allEntries: [mockEntry],
      activeEntry: mockEntry,
      onCreateEntry: () => {},
      onNavigate: () => {},
      onUpdateEntry: (entry, nextContent) => {
        updatedEntryReceived = entry;
        updatedContentReceived = nextContent || null;
      },
    };

    const newText = "## Seneca - Yeni Düzenlenmiş Metin\n\nBu güncel versiyondur.";
    const result = await updatePageTool.execute(
      {
        pageId: "page-seneca",
        content: newText,
        mode: "replace",
      },
      context
    );

    expect(result.success).toBe(true);
    expect(result.id).toBe("page-seneca");
    expect(context.allEntries[0].content).toBe(newText);
    expect(updatedEntryReceived).not.toBeNull();
    expect((updatedEntryReceived as any)?.content).toBe(newText);
    expect(updatedContentReceived).toBe(newText);
  });
});
