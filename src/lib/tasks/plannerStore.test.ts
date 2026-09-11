import { describe, it, expect, beforeEach } from "vitest";
import {
  saveReflection,
  getReflection,
  getReflections,
  type PlannerReflection,
} from "./plannerStore";

describe("Planner Store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves and retrieves reflections for a given date", () => {
    const today = "2026-09-10";
    const reflection: PlannerReflection = {
      date: today,
      completedTaskIds: ["task_1", "task_2"],
      rolledOverTaskIds: ["task_3"],
      blockers: "Unexpected bug in preprocessing script",
      energyScore: 4,
      createdAt: new Date().toISOString(),
    };

    saveReflection(reflection);

    const retrieved = getReflection(today);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.date).toBe(today);
    expect(retrieved?.completedTaskIds).toEqual(["task_1", "task_2"]);
    expect(retrieved?.rolledOverTaskIds).toEqual(["task_3"]);
    expect(retrieved?.energyScore).toBe(4);
    expect(retrieved?.blockers).toContain("Unexpected bug");

    const all = getReflections();
    expect(Object.keys(all).length).toBe(1);
    expect(all[today]).toBeDefined();
  });

  it("returns null for non-existent reflection date", () => {
    const nonExistent = getReflection("1999-01-01");
    expect(nonExistent).toBeNull();
  });
});
