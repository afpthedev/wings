import { AGENT_TOOLS_MAP } from "./registry";
import { ActionStep, ToolContext } from "./types";
import { ChatMessage } from "@/lib/ai/types";
import { streamChat } from "@/lib/ai/client";

export interface ParsedAction {
  rawMatch: string;
  toolName: string;
  args: Record<string, any>;
}

export function parseActionBlocks(text: string): {
  stripped: string;
  actions: ParsedAction[];
} {
  const actions: ParsedAction[] = [];
  const re = /```action:([a-zA-Z0-9_\-]+)\s*\n([\s\S]*?)```/g;

  const stripped = text.replace(re, (rawMatch, toolName, body) => {
    let args: Record<string, any> = {};
    try {
      args = JSON.parse(body.trim());
    } catch {
      // If not strict JSON, try key-value or raw string
      args = { raw: body.trim() };
    }
    actions.push({ rawMatch, toolName, args });
    return "";
  });

  return { stripped: stripped.trim(), actions };
}

export interface RunAgentOptions {
  history: ChatMessage[];
  systemInstruction: string;
  context: ToolContext;
  signal: AbortSignal;
  maxTurns?: number;
  images?: { base64: string; mimeType: string }[];
  onPartialText?: (text: string) => void;
  onActionStep?: (step: ActionStep) => void;
}

export async function runAgentLoop({
  history,
  systemInstruction,
  context,
  signal,
  maxTurns = 5,
  images,
  onPartialText,
  onActionStep,
}: RunAgentOptions): Promise<{
  finalText: string;
  steps: ActionStep[];
}> {
  const currentMessages: ChatMessage[] = [...history];
  const allSteps: ActionStep[] = [];
  let turn = 0;
  let accumulatedOutput = "";

  while (turn < maxTurns) {
    turn++;
    accumulatedOutput = "";

    // Stream the LLM response for this turn
    for await (const chunk of streamChat({
      messages: currentMessages,
      systemInstruction,
      signal,
      images: turn === 1 ? images : undefined, // images only needed on initial turn
    })) {
      accumulatedOutput += chunk;
      onPartialText?.(accumulatedOutput);
    }

    // Check if the response requested any tool actions
    const { stripped, actions } = parseActionBlocks(accumulatedOutput);

    if (actions.length === 0) {
      // Model did not request any tools; final answer reached
      return { finalText: stripped || accumulatedOutput, steps: allSteps };
    }

    // Execute the detected actions
    currentMessages.push({ role: "model", content: accumulatedOutput });

    let observationText = "";

    for (const action of actions) {
      const stepId = `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const step: ActionStep = {
        id: stepId,
        toolName: action.toolName,
        args: action.args,
        status: "running",
        timestamp: new Date().toISOString(),
      };
      allSteps.push(step);
      onActionStep?.(step);

      const tool = AGENT_TOOLS_MAP.get(action.toolName);
      if (!tool) {
        step.status = "error";
        step.error = `Tool "${action.toolName}" is not recognized.`;
        onActionStep?.(step);
        observationText += `\n[Tool Error: Unknown tool "${action.toolName}"]\n`;
        continue;
      }

      try {
        const result = await tool.execute(action.args, context);
        step.status = "success";
        step.result = result;
        onActionStep?.(step);
        observationText += `\nObservation [${action.toolName}]: ${JSON.stringify(result)}\n`;
      } catch (err: any) {
        step.status = "error";
        step.error = err?.message || "Execution failed";
        onActionStep?.(step);
        observationText += `\n[Tool Execution Error in ${action.toolName}: ${step.error}]\n`;
      }
    }

    // Feed the observation back to the model for the next reasoning step
    currentMessages.push({
      role: "user",
      content: `${observationText}\nNow evaluate the observations above and either call the next tool or present your final answer.`,
    });
  }

  const { stripped } = parseActionBlocks(accumulatedOutput);
  return { finalText: stripped || accumulatedOutput, steps: allSteps };
}
