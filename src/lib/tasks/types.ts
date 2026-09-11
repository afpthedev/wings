export type TaskPriority = "p1" | "p2" | "p3" | "none";
export type TaskStatus = "todo" | "in_progress" | "done";

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string; // ISO format: YYYY-MM-DD
  pageId?: string; // Linked note/project ID
  pageTitle?: string; // Cached note/project title
  tags?: string[];
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  completedAt?: string; // ISO datetime
}

export interface TaskStats {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  dueToday: number;
  overdue: number;
  completionRate: number; // 0 to 100 percentage
}

export interface TaskFilterOptions {
  search?: string;
  status?: TaskStatus | "all" | "open" | "dueToday" | "overdue";
  priority?: TaskPriority | "all";
  pageId?: string | "all";
  tag?: string;
}
