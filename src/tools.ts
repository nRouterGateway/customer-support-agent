import { runTools, type AgentTool, type ChatMessage } from '@nrouter_ai/sdk';
import type { ResolvedConfig, ToolCallEvent, CostEvent } from './types.js';

export interface ToolPhaseResult {
  /** Conversation including tool turns, ready for the final streamed answer. */
  messages: ChatMessage[];
  ranTools: boolean;
  text?: string;
  cost?: CostEvent;
}

/**
 * Run the SDK's bounded runTools over cfg.tools. No tools configured → messages unchanged.
 * `model` selects which configured model answers; it defaults to the primary.
 */
export async function runToolPhase(
  cfg: ResolvedConfig,
  messages: ChatMessage[],
  emit: (ev: ToolCallEvent) => void,
  signal?: AbortSignal,
  model?: string,
): Promise<ToolPhaseResult> {
  if (!cfg.tools || cfg.tools.length === 0) {
    return { messages, ranTools: false };
  }

  let ranTools = false;
  const wrappedTools: AgentTool[] = cfg.tools.map(tool => ({
    definition: tool.definition,
    execute: async (args, call) => {
      ranTools = true;
      const title = tool.definition.function.name;
      const toolName = call?.function?.name || title;
      emit({ tool: toolName, title, status: 'running' });
      try {
        const result = await tool.execute(args, call);
        if (
          result &&
          typeof result === 'object' &&
          'status' in result &&
          (result as { status?: string }).status === 'error'
        ) {
          emit({ tool: toolName, title, status: 'error' });
          // Keep the tool's own payload (code, details, data); only normalize the error text.
          const failed = result as { error?: string; message?: string } & Record<string, unknown>;
          const errorText = failed.error || failed.message || 'Tool execution failed';
          return {
            ...failed,
            toolName,
            status: 'error',
            error: errorText,
            message: failed.message || errorText,
          };
        }
        emit({ tool: toolName, title, status: 'done' });
        return result;
      } catch (err) {
        emit({ tool: toolName, title, status: 'error' });
        throw err;
      }
    }
  }));

  const result = await runTools(cfg.client.nr, {
    model: model ?? cfg.models[0]!,
    messages,
    tools: wrappedTools,
    maxSteps: cfg.maxToolSteps,
    maxTokens: cfg.maxTokens,
    signal,
  });

  let cost: CostEvent = { costUsd: null, status: 'unpriced' };
  if (result.cost && result.cost.complete && result.cost.priced > 0) {
    cost = { costUsd: result.cost.total, status: 'exact' };
  }

  return {
    messages: result.messages,
    ranTools,
    text: result.text,
    cost,
  };
}
