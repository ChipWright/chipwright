// The neutral model between the agent loop and every LLM provider. The loop and the tools
// speak only these types; each provider adapter is the sole place that translates them to
// and from one vendor's wire format. This is what makes the assistant provider-agnostic:
// adding or swapping a provider never touches the agent or the tools.

export type Role = "user" | "assistant" | "tool";

// A request from the model to run one tool, with already-parsed arguments.
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  role: Role;
  content: string;
  // Present on assistant messages that ask to run tools.
  toolCalls?: ToolCall[];
  // Present on tool messages: which call this result answers. Providers that correlate by
  // id (OpenAI, Anthropic) use this; those that correlate by name (Gemini) use `name`.
  toolCallId?: string;
  // Present on tool messages: the name of the tool that produced this result.
  name?: string;
}

// A tool as advertised to the model: a name, a description, and a JSON Schema for its
// arguments. The schema object is passed through to each provider's tool format.
export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type StopReason = "end" | "tool_use";

// One turn back from a provider, already normalized: any assistant text, any tool calls,
// and why the model stopped.
export interface Completion {
  text: string;
  toolCalls: ToolCall[];
  stop: StopReason;
}

export interface CompletionRequest {
  system: string;
  messages: Message[];
  tools: ToolSchema[];
  model: string;
  maxTokens: number;
  temperature?: number;
}

// Every provider implements exactly this. `name` is for diagnostics only.
export interface LlmProvider {
  readonly name: string;
  complete(request: CompletionRequest): Promise<Completion>;
}
