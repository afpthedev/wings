import { describe, it, expect, vi } from "vitest";

const mockCollections: any[] = [];

vi.mock("@/lib/collectionStore", () => ({
  fetchCollections: vi.fn().mockImplementation(async () => mockCollections),
  createCollection: vi.fn().mockImplementation(async (userId, name, rules, pageIds) => {
    const col = { id: `col_${Date.now()}`, name, rules, allowList: pageIds || [] };
    mockCollections.push(col);
    return col;
  }),
  addPagesToCollection: vi.fn().mockImplementation(async (userId, colId, pageIds) => {
    const c = mockCollections.find((x) => x.id === colId);
    if (c) c.allowList = [...new Set([...(c.allowList || []), ...pageIds])];
  }),
}));

import {
  listCollectionsTool,
  createCollectionTool,
  addToCollectionTool,
} from "./collectionTools";
import { ToolContext } from "./types";

describe("Collection Tools", () => {
  const context: ToolContext = {
    userId: "test-user",
    allEntries: [
      {
        id: "p1",
        user_id: "test-user",
        title: "Deep Learning Intro",
        content: "Content",
        parent_id: null,
        created_at: "",
        updated_at: "",
        pinned: false,
      },
    ],
    activeEntry: null,
    onCreateEntry: () => {},
    onNavigate: () => {},
  };

  it("creates a collection, lists collections, and adds page to collection", async () => {
    mockCollections.length = 0;

    const createRes = await createCollectionTool.execute(
      { name: "Research Papers" },
      context
    );
    expect(createRes.success).toBe(true);
    expect(createRes.name).toBe("Research Papers");

    const listRes = await listCollectionsTool.execute({}, context);
    expect(listRes.total).toBe(1);
    expect(listRes.collections[0].name).toBe("Research Papers");

    const addRes = await addToCollectionTool.execute(
      {
        collectionNameOrId: "Research Papers",
        pageId: "p1",
      },
      context
    );
    expect(addRes.success).toBe(true);
    expect(addRes.collectionName).toBe("Research Papers");
  });
});
