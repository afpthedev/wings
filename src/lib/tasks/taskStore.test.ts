import { describe, it, expect, beforeEach } from "vitest";
import {
  parseTaskString,
  createTask,
  updateTask,
  deleteTask,
  toggleTaskStatus,
  calculateTaskStats,
  getStoredTasks,
  saveStoredTasks,
} from "./taskStore";
import { TaskItem } from "./types";

describe("Task Store & Parser", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("parses NLP shortcuts correctly", () => {
    const parsed = parseTaskString("Finish data preprocessing #p1 @today #academic #nlp");
    expect(parsed.title).toBe("Finish data preprocessing");
    expect(parsed.priority).toBe("p1");
    expect(parsed.tags).toEqual(["academic", "nlp"]);
    expect(parsed.dueDate).toBe(new Date().toISOString().slice(0, 10));
  });

  it("parses @tomorrow shortcut", () => {
    const parsed = parseTaskString("Submit report @tomorrow #p2");
    expect(parsed.title).toBe("Submit report");
    expect(parsed.priority).toBe("p2");
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    expect(parsed.dueDate).toBe(tom.toISOString().slice(0, 10));
  });

  it("creates, updates, and deletes tasks", () => {
    const task = createTask({
      title: "Test Task 1",
      priority: "p1",
      dueDate: "2026-09-15",
    });

    expect(task.id).toBeDefined();
    expect(task.title).toBe("Test Task 1");
    expect(task.status).toBe("todo");

    const tasksAfterCreate = getStoredTasks();
    expect(tasksAfterCreate.length).toBe(1);

    const updated = updateTask(task.id, { status: "in_progress" });
    expect(updated?.status).toBe("in_progress");

    const toggled = toggleTaskStatus(task.id);
    expect(toggled?.status).toBe("done");
    expect(toggled?.completedAt).toBeDefined();

    const deleted = deleteTask(task.id);
    expect(deleted).toBe(true);
    expect(getStoredTasks().length).toBe(0);
  });

  it("calculates accurate task stats", () => {
    const today = new Date().toISOString().slice(0, 10);
    const mockTasks: TaskItem[] = [
      {
        id: "1",
        title: "Task 1",
        status: "todo",
        priority: "p1",
        dueDate: today,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "2",
        title: "Task 2",
        status: "in_progress",
        priority: "p2",
        dueDate: "2026-01-01", // overdue
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "3",
        title: "Task 3",
        status: "done",
        priority: "none",
        createdAt: "",
        updatedAt: "",
      },
    ];

    const stats = calculateTaskStats(mockTasks);
    expect(stats.total).toBe(3);
    expect(stats.todo).toBe(1);
    expect(stats.inProgress).toBe(1);
    expect(stats.done).toBe(1);
    expect(stats.dueToday).toBe(1);
    expect(stats.overdue).toBe(1);
    expect(stats.completionRate).toBe(33);
  });
});
