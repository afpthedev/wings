import { AgentTool } from "./types";
import {
  fetchCollections,
  createCollection,
  addPagesToCollection,
} from "@/lib/collectionStore";
import { getEntryTitle } from "@/lib/journal";

export const listCollectionsTool: AgentTool = {
  name: "list_collections",
  description: "List all collections in the workspace with their names and IDs.",
  parameters: {
    type: "object",
    properties: {},
  },
  async execute({}, context) {
    const userId = context.userId || "anonymous";
    const collections = await fetchCollections(userId);

    return {
      total: collections.length,
      collections: collections.map((c) => ({
        id: c.id,
        name: c.name,
        pageCount: c.allowList?.length ?? 0,
      })),
    };
  },
};

export const createCollectionTool: AgentTool<{
  name: string;
  initialPageIds?: string[];
}> = {
  name: "create_collection",
  description: "Create a new Collection to group related documents and projects.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the collection (e.g. 'Thesis Research', 'Client Projects').",
      },
      initialPageIds: {
        type: "string",
        description: "Optional comma-separated page IDs to include in the collection.",
      },
    },
    required: ["name"],
  },
  async execute({ name, initialPageIds }, context) {
    const userId = context.userId || "anonymous";
    const pageIds = Array.isArray(initialPageIds)
      ? initialPageIds
      : typeof initialPageIds === "string"
      ? (initialPageIds as string).split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const created = await createCollection(
      userId,
      name,
      { filters: [] },
      pageIds
    );

    return {
      success: true,
      id: created.id,
      name: created.name,
      pageCount: pageIds.length,
      message: `Created collection "${name}" with ${pageIds.length} pages.`,
    };
  },
};

export const addToCollectionTool: AgentTool<{
  collectionNameOrId: string;
  pageId: string;
}> = {
  name: "add_to_collection",
  description: "Add a page or document to a collection.",
  parameters: {
    type: "object",
    properties: {
      collectionNameOrId: {
        type: "string",
        description: "Name or ID of the collection.",
      },
      pageId: {
        type: "string",
        description: "ID of the page to add to the collection.",
      },
    },
    required: ["collectionNameOrId", "pageId"],
  },
  async execute({ collectionNameOrId, pageId }, context) {
    const userId = context.userId || "anonymous";
    const collections = await fetchCollections(userId);

    const q = collectionNameOrId.toLowerCase().trim();
    const collection = collections.find(
      (c) => c.id === collectionNameOrId || c.name.toLowerCase() === q
    );

    if (!collection) {
      return {
        success: false,
        error: `Collection "${collectionNameOrId}" not found. Available collections: ${collections.map((c) => c.name).join(", ") || "None"}`,
      };
    }

    const page = context.allEntries.find((e) => e.id === pageId);
    const pageTitle = page ? getEntryTitle(page) : pageId;

    await addPagesToCollection(userId, collection.id, [pageId]);

    return {
      success: true,
      collectionId: collection.id,
      collectionName: collection.name,
      pageId,
      pageTitle,
      message: `Added page "${pageTitle}" to collection "${collection.name}".`,
    };
  },
};
