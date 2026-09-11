import type { Entry } from "@/lib/journal";

export interface ToolProperty {
  type: string;
  description: string;
  enum?: string[];
}

export interface AgentTool<TArgs = any, TResult = any> {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolProperty>;
    required?: string[];
  };
  execute: (args: TArgs, context: ToolContext) => Promise<TResult>;
}

export interface ToolContext {
  userId?: string;
  allEntries: Entry[];
  activeEntry: Entry | null;
  onCreateEntry: (entry: Entry) => void;
  onNavigate: (id: string) => void;
  reloadEntries?: () => Promise<void>;
}

export interface ActionStep {
  id: string;
  toolName: string;
  args: Record<string, any>;
  status: "running" | "success" | "error";
  result?: any;
  error?: string;
  timestamp: string;
}
