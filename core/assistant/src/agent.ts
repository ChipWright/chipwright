// The agent loop. It is provider-agnostic: it sends the conversation and the tool schemas
// to whatever provider it is given, runs any tool calls the model returns, feeds the
// results back, and repeats until the model gives a final answer or a step cap is reached.
// It never applies changes itself; proposals are collected for a surface to confirm.

import type { LlmProvider, Message } from "./types.js";
import type { DeviceProposal, Tool, ToolContext } from "./tools.js";

export const DEFAULT_SYSTEM_PROMPT = `You are the OpenHome device development assistant. You help engineers understand, diagnose, and evolve smart-device definitions written in the OpenHome Device Definition Language (DDL), a YAML manifest.

The manifest shape is:
  device: { name (lower_snake_case), manufacturer, category }
  capabilities: { <name>: { type: sensor|actuator, ... } }   # sensors have unit and range; actuators have modes
  connectivity: { protocols: [matter, thread, bluetooth, wifi, zigbee, ...] }
  power: { battery: { rechargeable: true|false } }            # omit power for mains-powered devices
  security: { encryption: { enabled: true|false } }

Rules:
- Ground everything in the tools. Never invent capabilities or claim a manifest is valid without checking.
- When asked to read an existing device, call read_device first.
- When creating or editing a device, build the full manifest, then verify it with validate_manifest or compile_manifest, fix any diagnostics, and finalize with propose_device.
- propose_device only accepts a manifest that compiles; if it is rejected, correct the errors and try again.
- Do not apply changes yourself. Proposing is where your job ends; the developer decides whether to apply.
- Be concise and specific.`;

export interface AgentOptions {
  provider: LlmProvider;
  tools: Tool[];
  context: ToolContext;
  messages: Message[];
  model: string;
  system?: string;
  maxSteps?: number;
  maxTokens?: number;
  temperature?: number;
}

export interface AgentResult {
  answer: string;
  proposals: DeviceProposal[];
  steps: number;
}

export async function runAgent(options: AgentOptions): Promise<AgentResult> {
  const registry = new Map(options.tools.map((t) => [t.schema.name, t]));
  const schemas = options.tools.map((t) => t.schema);
  const messages: Message[] = [...options.messages];
  const maxSteps = options.maxSteps ?? 12;

  for (let step = 0; step < maxSteps; step++) {
    const completion = await options.provider.complete({
      system: options.system ?? DEFAULT_SYSTEM_PROMPT,
      messages,
      tools: schemas,
      model: options.model,
      maxTokens: options.maxTokens ?? 4096,
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    });

    if (completion.toolCalls.length === 0) {
      return { answer: completion.text, proposals: options.context.proposals, steps: step + 1 };
    }

    messages.push({ role: "assistant", content: completion.text, toolCalls: completion.toolCalls });
    for (const call of completion.toolCalls) {
      const tool = registry.get(call.name);
      let result: string;
      if (tool === undefined) {
        result = `error: unknown tool "${call.name}"`;
      } else {
        try {
          result = await tool.handler(call.arguments, options.context);
        } catch (error) {
          result = `error: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      messages.push({ role: "tool", content: result, toolCallId: call.id, name: call.name });
    }
  }

  return {
    answer: "Reached the step limit before finishing. Try narrowing the request.",
    proposals: options.context.proposals,
    steps: maxSteps,
  };
}
