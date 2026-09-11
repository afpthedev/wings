import { AgentTool, ToolContext } from "./types";
import {
  createEntry,
  updateEntry,
  getEntryTitle,
  Entry,
} from "@/lib/journal";
import {
  getStoredTasks,
  createTask as storeCreateTask,
  updateTask as storeUpdateTask,
} from "@/lib/tasks/taskStore";
import { TaskPriority, TaskStatus } from "@/lib/tasks/types";

export const searchPagesTool: AgentTool<{ query: string }> = {
  name: "search_pages",
  description: "Search across all notes and pages in the workspace by title or content.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query to match against page titles and contents.",
      },
    },
    required: ["query"],
  },
  async execute({ query }, context) {
    const q = query.toLowerCase().trim();
    if (!q) return { results: [] };

    const matches = context.allEntries
      .filter((e) => {
        const title = getEntryTitle(e).toLowerCase();
        const content = (e.content || "").toLowerCase();
        return title.includes(q) || content.includes(q);
      })
      .slice(0, 8)
      .map((e) => {
        const title = getEntryTitle(e);
        const content = e.content || "";
        const idx = content.toLowerCase().indexOf(q);
        let snippet = "";
        if (idx !== -1) {
          const start = Math.max(0, idx - 40);
          const end = Math.min(content.length, idx + 80);
          snippet = content.slice(start, end).replace(/\n/g, " ");
        } else {
          snippet = content.slice(0, 100).replace(/\n/g, " ");
        }
        return {
          id: e.id,
          title,
          snippet: snippet.trim(),
        };
      });

    return { query, resultsCount: matches.length, results: matches };
  },
};

export const readPageTool: AgentTool<{ pageId?: string; title?: string }> = {
  name: "read_page",
  description: "Read the full markdown content of a page by its pageId or exact title.",
  parameters: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: "The unique ID of the page to read.",
      },
      title: {
        type: "string",
        description: "The title of the page to read (if pageId is unknown).",
      },
    },
  },
  async execute({ pageId, title }, context) {
    let entry: Entry | undefined;

    if (pageId) {
      entry = context.allEntries.find((e) => e.id === pageId);
    } else if (title) {
      const q = title.toLowerCase().trim();
      entry = context.allEntries.find(
        (e) => getEntryTitle(e).toLowerCase() === q
      );
      if (!entry) {
        entry = context.allEntries.find((e) =>
          getEntryTitle(e).toLowerCase().includes(q)
        );
      }
    }

    if (!entry) {
      return {
        found: false,
        error: `Page not found for ${pageId ? `id: "${pageId}"` : `title: "${title}"`}`,
      };
    }

    return {
      found: true,
      id: entry.id,
      title: getEntryTitle(entry),
      content: entry.content || "",
      parentId: entry.parent_id || null,
      updatedAt: entry.updated_at,
    };
  },
};

export const createPageTool: AgentTool<{
  title: string;
  content?: string;
  parentId?: string;
}> = {
  name: "create_page",
  description: "Create a new document, note, or project in the workspace.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "The title of the new page.",
      },
      content: {
        type: "string",
        description: "Markdown content to initialize the page with.",
      },
      parentId: {
        type: "string",
        description: "Optional parent page ID to create as a subpage.",
      },
    },
    required: ["title"],
  },
  async execute({ title, content = "", parentId }, context) {
    const ownerId = context.userId || "anonymous";
    const newEntry = await createEntry(ownerId, content, {
      title,
      parentId: parentId || undefined,
    });

    context.onCreateEntry(newEntry);

    return {
      success: true,
      id: newEntry.id,
      title: getEntryTitle(newEntry),
      message: `Created page "${getEntryTitle(newEntry)}"`,
    };
  },
};

export const updatePageTool: AgentTool<{
  pageId: string;
  content: string;
  mode?: "append" | "prepend" | "replace";
}> = {
  name: "update_page",
  description: "Update the content of an existing page by appending, prepending, or replacing content.",
  parameters: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: "The unique ID of the page to update.",
      },
      content: {
        type: "string",
        description: "The markdown content to write.",
      },
      mode: {
        type: "string",
        enum: ["append", "prepend", "replace"],
        description: "Whether to append to the end, prepend to the top, or replace the entire content.",
      },
    },
    required: ["pageId", "content"],
  },
  async execute({ pageId, content, mode = "append" }, context) {
    const entry = context.allEntries.find((e) => e.id === pageId);
    if (!entry) {
      return { success: false, error: `Page with ID ${pageId} not found.` };
    }

    let nextContent = content;
    const current = entry.content || "";
    if (mode === "append") {
      nextContent = current ? `${current}\n\n${content}` : content;
    } else if (mode === "prepend") {
      nextContent = current ? `${content}\n\n${current}` : content;
    }

    await updateEntry(pageId, nextContent);

    return {
      success: true,
      id: pageId,
      title: getEntryTitle(entry),
      mode,
      message: `Updated page "${getEntryTitle(entry)}" (${mode})`,
    };
  },
};

export const linkPagesTool: AgentTool<{
  sourcePageId: string;
  targetPageId: string;
}> = {
  name: "link_pages",
  description: "Create a bidirectional wiki link [[Target Page]] inside a source page.",
  parameters: {
    type: "object",
    properties: {
      sourcePageId: {
        type: "string",
        description: "The page to insert the link into.",
      },
      targetPageId: {
        type: "string",
        description: "The page to link to.",
      },
    },
    required: ["sourcePageId", "targetPageId"],
  },
  async execute({ sourcePageId, targetPageId }, context) {
    const source = context.allEntries.find((e) => e.id === sourcePageId);
    const target = context.allEntries.find((e) => e.id === targetPageId);

    if (!source || !target) {
      return { success: false, error: "One or both pages could not be found." };
    }

    const targetTitle = getEntryTitle(target);
    const linkStr = `[[${targetTitle}]]`;
    const content = source.content || "";

    if (content.includes(linkStr)) {
      return { success: true, message: `Page already contains link to [[${targetTitle}]]` };
    }

    const updatedContent = content ? `${content}\n\nRelated: ${linkStr}` : `Related: ${linkStr}`;
    await updateEntry(sourcePageId, updatedContent);

    return {
      success: true,
      message: `Linked [[${targetTitle}]] inside "${getEntryTitle(source)}"`,
    };
  },
};

export const listTasksTool: AgentTool<{
  status?: TaskStatus | "all" | "open";
  priority?: TaskPriority | "all";
  pageId?: string;
}> = {
  name: "list_tasks",
  description: "List and filter tasks from the workspace task manager.",
  parameters: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["all", "open", "todo", "in_progress", "done"],
        description: "Filter by task status.",
      },
      priority: {
        type: "string",
        enum: ["all", "p1", "p2", "p3", "none"],
        description: "Filter by priority level.",
      },
      pageId: {
        type: "string",
        description: "Filter tasks associated with a specific page or project.",
      },
    },
  },
  async execute({ status = "open", priority = "all", pageId }, context) {
    const all = getStoredTasks(context.userId);
    const filtered = all.filter((t) => {
      if (status === "open" && t.status === "done") return false;
      if (status !== "all" && status !== "open" && t.status !== status) return false;
      if (priority !== "all" && t.priority !== priority) return false;
      if (pageId && t.pageId !== pageId) return false;
      return true;
    });

    return {
      total: all.length,
      matchedCount: filtered.length,
      tasks: filtered.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        project: t.pageTitle,
        tags: t.tags,
      })),
    };
  },
};

export const createTaskTool: AgentTool<{
  title: string;
  priority?: TaskPriority;
  dueDate?: string;
  pageId?: string;
  tags?: string[];
  status?: TaskStatus;
}> = {
  name: "create_task",
  description: "Create a new structured task in the task manager and optionally associate it with a note.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "The title or action statement for the task.",
      },
      priority: {
        type: "string",
        enum: ["none", "p1", "p2", "p3"],
        description: "Priority level (p1: urgent, p2: high, p3: low, none: normal).",
      },
      dueDate: {
        type: "string",
        description: "Due date in YYYY-MM-DD format, or 'today', 'tomorrow'.",
      },
      pageId: {
        type: "string",
        description: "Optional page ID to link this task to a project.",
      },
      tags: {
        type: "string",
        description: "Comma-separated tags for this task.",
      },
      status: {
        type: "string",
        enum: ["todo", "in_progress", "done"],
        description: "Initial status.",
      },
    },
    required: ["title"],
  },
  async execute(args, context) {
    let pageTitle: string | undefined;
    if (args.pageId) {
      const p = context.allEntries.find((e) => e.id === args.pageId);
      if (p) pageTitle = getEntryTitle(p);
    }

    let dueDate = args.dueDate;
    const todayStr = new Date().toISOString().slice(0, 10);
    if (dueDate === "today") dueDate = todayStr;
    else if (dueDate === "tomorrow") {
      const tom = new Date();
      tom.setDate(tom.getDate() + 1);
      dueDate = tom.toISOString().slice(0, 10);
    }

    const task = storeCreateTask(
      {
        title: args.title,
        priority: args.priority || "none",
        dueDate,
        pageId: args.pageId,
        pageTitle,
        tags: Array.isArray(args.tags)
          ? args.tags
          : typeof args.tags === "string"
          ? (args.tags as string).split(",").map((s) => s.trim())
          : [],
        status: args.status || "todo",
      },
      context.userId
    );

    // If pageId was provided, also append markdown checkbox to that page
    if (args.pageId) {
      const p = context.allEntries.find((e) => e.id === args.pageId);
      if (p) {
        const pContent = p.content || "";
        const pLine = `- [ ] ${task.title}${task.priority !== "none" ? ` #${task.priority}` : ""}${task.dueDate ? ` @${task.dueDate}` : ""}`;
        await updateEntry(p.id, pContent ? `${pContent}\n${pLine}` : pLine);
      }
    }

    return {
      success: true,
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        project: task.pageTitle,
      },
      message: `Created task "${task.title}"`,
    };
  },
};

export const updateTaskTool: AgentTool<{
  taskId: string;
  status?: TaskStatus;
  title?: string;
  dueDate?: string;
  priority?: TaskPriority;
}> = {
  name: "update_task",
  description: "Update a task's status, priority, due date, or title.",
  parameters: {
    type: "object",
    properties: {
      taskId: {
        type: "string",
        description: "The unique ID of the task.",
      },
      status: {
        type: "string",
        enum: ["todo", "in_progress", "done"],
        description: "New status.",
      },
      priority: {
        type: "string",
        enum: ["none", "p1", "p2", "p3"],
        description: "New priority level.",
      },
      dueDate: {
        type: "string",
        description: "New due date in YYYY-MM-DD format.",
      },
      title: {
        type: "string",
        description: "Updated task title.",
      },
    },
    required: ["taskId"],
  },
  async execute({ taskId, status, priority, dueDate, title }, context) {
    const updated = storeUpdateTask(
      taskId,
      {
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(title ? { title } : {}),
      },
      context.userId
    );

    if (!updated) {
      return { success: false, error: `Task ${taskId} not found.` };
    }

    return {
      success: true,
      task: updated,
      message: `Updated task "${updated.title}" -> status: ${updated.status}`,
    };
  },
};
