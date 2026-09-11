import { useState, useEffect, useCallback } from "react";
import { TaskItem, TaskStats } from "./types";
import {
  getStoredTasks,
  saveStoredTasks,
  createTask as storeCreateTask,
  updateTask as storeUpdateTask,
  deleteTask as storeDeleteTask,
  toggleTaskStatus as storeToggleStatus,
  calculateTaskStats,
  WINGS_TASKS_EVENT,
} from "./taskStore";

export function useTasks(userId?: string) {
  const [tasks, setTasks] = useState<TaskItem[]>(() => getStoredTasks(userId));
  const [stats, setStats] = useState<TaskStats>(() => calculateTaskStats(tasks));

  const refresh = useCallback(() => {
    const latest = getStoredTasks(userId);
    setTasks(latest);
    setStats(calculateTaskStats(latest));
  }, [userId]);

  useEffect(() => {
    refresh();

    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ userId?: string }>;
      if (!customEvent.detail || customEvent.detail.userId === userId) {
        refresh();
      }
    };

    window.addEventListener(WINGS_TASKS_EVENT, handleUpdate);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(WINGS_TASKS_EVENT, handleUpdate);
      window.removeEventListener("storage", refresh);
    };
  }, [userId, refresh]);

  const addTask = useCallback(
    (data: Partial<TaskItem> & { title: string }) => {
      const created = storeCreateTask(data, userId);
      refresh();
      return created;
    },
    [userId, refresh]
  );

  const updateTask = useCallback(
    (id: string, updates: Partial<TaskItem>) => {
      const updated = storeUpdateTask(id, updates, userId);
      refresh();
      return updated;
    },
    [userId, refresh]
  );

  const removeTask = useCallback(
    (id: string) => {
      const ok = storeDeleteTask(id, userId);
      refresh();
      return ok;
    },
    [userId, refresh]
  );

  const toggleStatus = useCallback(
    (id: string) => {
      const updated = storeToggleStatus(id, userId);
      refresh();
      return updated;
    },
    [userId, refresh]
  );

  return {
    tasks,
    stats,
    addTask,
    updateTask,
    removeTask,
    toggleStatus,
    refresh,
  };
}
