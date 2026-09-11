import { TaskItem, TaskPriority, TaskStats, TaskStatus } from "./types";
import type { Entry } from "@/lib/journal";
import { getEntryTitle } from "@/lib/journal";

export const WINGS_TASKS_EVENT = "wings_tasks_changed";

function getStorageKey(userId?: string): string {
  return `wings_tasks_${userId || "local"}`;
}

export function getStoredTasks(userId?: string): TaskItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to read tasks from storage", err);
    return [];
  }
}

export function saveStoredTasks(tasks: TaskItem[], userId?: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(tasks));
    window.dispatchEvent(new CustomEvent(WINGS_TASKS_EVENT, { detail: { userId } }));
  } catch (err) {
    console.error("Failed to save tasks to storage", err);
  }
}

/**
 * Parses NLP shortcuts from a quick-add input string.
 * Supports:
 *   #p1, #p2, #p3 -> priority
 *   #tag -> tags
 *   @today, @tomorrow, @YYYY-MM-DD -> dueDate
 */
export function parseTaskString(raw: string): {
  title: string;
  priority: TaskPriority;
  dueDate?: string;
  tags: string[];
} {
  let text = raw.trim();
  let priority: TaskPriority = "none";
  let dueDate: string | undefined = undefined;
  const tags: string[] = [];

  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  // Parse priority: #p1, #p2, #p3
  const pMatch = text.match(/#(p[1-3])\b/i);
  if (pMatch) {
    priority = pMatch[1].toLowerCase() as TaskPriority;
    text = text.replace(pMatch[0], "").trim();
  }

  // Parse date: @today, @tomorrow, @YYYY-MM-DD
  const dateMatch = text.match(/@(\d{4}-\d{2}-\d{2}|today|tomorrow)\b/i);
  if (dateMatch) {
    const dateVal = dateMatch[1].toLowerCase();
    if (dateVal === "today") dueDate = todayStr;
    else if (dateVal === "tomorrow") dueDate = tomorrowStr;
    else dueDate = dateVal;
    text = text.replace(dateMatch[0], "").trim();
  }

  // Parse tags: #tagname
  const tagMatches = text.match(/#([a-zA-Z0-9_\-]+)/g);
  if (tagMatches) {
    for (const tm of tagMatches) {
      const tag = tm.slice(1);
      if (!tags.includes(tag)) tags.push(tag);
      text = text.replace(tm, "").trim();
    }
  }

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  return {
    title: text || "Untitled Task",
    priority,
    dueDate,
    tags,
  };
}

export function createTask(
  data: Partial<TaskItem> & { title: string },
  userId?: string
): TaskItem {
  const tasks = getStoredTasks(userId);
  const now = new Date().toISOString();

  const newTask: TaskItem = {
    id: data.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: data.title.trim(),
    description: data.description?.trim(),
    status: data.status || "todo",
    priority: data.priority || "none",
    dueDate: data.dueDate,
    pageId: data.pageId,
    pageTitle: data.pageTitle,
    tags: data.tags || [],
    createdAt: data.createdAt || now,
    updatedAt: now,
    completedAt: data.status === "done" ? now : undefined,
  };

  const updated = [newTask, ...tasks];
  saveStoredTasks(updated, userId);
  return newTask;
}

export function updateTask(
  id: string,
  updates: Partial<TaskItem>,
  userId?: string
): TaskItem | null {
  const tasks = getStoredTasks(userId);
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  const current = tasks[idx];
  const now = new Date().toISOString();
  const nextStatus = updates.status !== undefined ? updates.status : current.status;
  
  const updatedItem: TaskItem = {
    ...current,
    ...updates,
    status: nextStatus,
    updatedAt: now,
    completedAt:
      nextStatus === "done"
        ? current.completedAt || now
        : undefined,
  };

  tasks[idx] = updatedItem;
  saveStoredTasks(tasks, userId);
  return updatedItem;
}

export function deleteTask(id: string, userId?: string): boolean {
  const tasks = getStoredTasks(userId);
  const filtered = tasks.filter((t) => t.id !== id);
  if (filtered.length === tasks.length) return false;
  saveStoredTasks(filtered, userId);
  return true;
}

export function toggleTaskStatus(id: string, userId?: string): TaskItem | null {
  const tasks = getStoredTasks(userId);
  const item = tasks.find((t) => t.id === id);
  if (!item) return null;

  const nextStatus: TaskStatus = item.status === "done" ? "todo" : "done";
  return updateTask(id, { status: nextStatus }, userId);
}

export function calculateTaskStats(tasks: TaskItem[]): TaskStats {
  const today = new Date().toISOString().slice(0, 10);
  let todo = 0;
  let inProgress = 0;
  let done = 0;
  let dueToday = 0;
  let overdue = 0;

  for (const t of tasks) {
    if (t.status === "done") {
      done++;
    } else if (t.status === "in_progress") {
      inProgress++;
    } else {
      todo++;
    }

    if (t.status !== "done" && t.dueDate) {
      if (t.dueDate === today) {
        dueToday++;
      } else if (t.dueDate < today) {
        overdue++;
      }
    }
  }

  const total = tasks.length;
  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

  return {
    total,
    todo,
    inProgress,
    done,
    dueToday,
    overdue,
    completionRate,
  };
}

/**
 * Scans user pages for markdown task lists (- [ ] and - [x])
 * and imports new tasks if they don't exist yet in the task database.
 */
export function syncTasksFromPages(entries: Entry[], userId?: string): TaskItem[] {
  const existing = getStoredTasks(userId);
  const existingMap = new Map(existing.map((t) => [`${t.pageId || ""}_${t.title}`, t]));
  let hasNew = false;
  const now = new Date().toISOString();

  for (const entry of entries) {
    if (!entry.content) continue;
    const pageTitle = getEntryTitle(entry);
    const lines = entry.content.split("\n");

    for (const line of lines) {
      const match = line.match(/^[ \t]*-\s*\[([ xX])\]\s+(.+)$/);
      if (!match) continue;

      const isChecked = match[1].toLowerCase() === "x";
      const rawText = match[2];
      const parsed = parseTaskString(rawText);

      const key = `${entry.id}_${parsed.title}`;
      const found = existingMap.get(key);

      if (!found) {
        const newTask: TaskItem = {
          id: `task_page_${entry.id.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title: parsed.title,
          status: isChecked ? "done" : "todo",
          priority: parsed.priority,
          dueDate: parsed.dueDate,
          tags: parsed.tags,
          pageId: entry.id,
          pageTitle,
          createdAt: now,
          updatedAt: now,
          completedAt: isChecked ? now : undefined,
        };
        existing.push(newTask);
        existingMap.set(key, newTask);
        hasNew = true;
      }
    }
  }

  if (hasNew) {
    saveStoredTasks(existing, userId);
  }

  return existing;
}
