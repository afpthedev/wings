import { AgentTool } from "./types";
import {
  searchPagesTool,
  readPageTool,
  createPageTool,
  updatePageTool,
  linkPagesTool,
  listTasksTool,
  createTaskTool,
  updateTaskTool,
} from "./workspaceTools";
import {
  dailyPlanTool,
  weeklyPlanTool,
  projectSummaryTool,
  sendPlannerEmailTool,
} from "./personalOsTools";
import {
  createProjectWorkspaceTool,
  writeServerFileTool,
  readServerFileTool,
  downloadToWorkspaceTool,
  listWorkspaceFilesTool,
  linkWorkspaceToPageTool,
} from "./serverFsTools";
import {
  listCollectionsTool,
  createCollectionTool,
  addToCollectionTool,
} from "./collectionTools";

export const AGENT_TOOLS: AgentTool[] = [
  // Workspace Pages & Notes
  searchPagesTool,
  readPageTool,
  createPageTool,
  updatePageTool,
  linkPagesTool,

  // Task Management
  listTasksTool,
  createTaskTool,
  updateTaskTool,

  // Personal OS
  dailyPlanTool,
  weeklyPlanTool,
  projectSummaryTool,
  sendPlannerEmailTool,

  // Server Filesystem & Workspace
  createProjectWorkspaceTool,
  writeServerFileTool,
  readServerFileTool,
  downloadToWorkspaceTool,
  listWorkspaceFilesTool,
  linkWorkspaceToPageTool,

  // Collections
  listCollectionsTool,
  createCollectionTool,
  addToCollectionTool,
];

export const AGENT_TOOLS_MAP = new Map<string, AgentTool>(
  AGENT_TOOLS.map((t) => [t.name, t])
);

/**
 * Builds the tool documentation block injected into the Agent system prompt.
 */
export function formatToolsSystemPrompt(): string {
  let str = "## Available Workspace Agent Tools\n";
  str += "You have direct access to execute real actions across the user's notes, tasks, collections, and server workspace. To call a tool, output an action block in this EXACT format:\n\n";
  str += "```action:tool_name\n";
  str += '{"parameter_name": "value"}\n';
  str += "```\n\n";
  str += "After emitting the action block, stop outputting and wait. The system will execute the tool and return the observation back to you.\n\n";
  str += "### Tool Catalog:\n";

  for (const tool of AGENT_TOOLS) {
    str += `\n- **${tool.name}**: ${tool.description}\n`;
    str += `  Parameters: ${JSON.stringify(tool.parameters.properties)}\n`;
    if (tool.parameters.required?.length) {
      str += `  Required: [${tool.parameters.required.join(", ")}]\n`;
    }
  }

  return str;
}
