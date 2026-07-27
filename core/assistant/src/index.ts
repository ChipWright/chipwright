// Public API of the AI development assistant: the provider abstraction and adapters, the
// grounded toolset, and the agent loop. A CLI (cli.ts) and a future IDE panel both build on
// this surface; it never imports a shell, so it is portable across them.

export const version = "0.0.0";

export * from "./types.js";
export * from "./config.js";
export {
  providerFromConfig,
  AnthropicProvider,
  GeminiProvider,
  OpenAiCompatibleProvider,
  MockProvider,
  ProviderError,
} from "./providers/index.js";
export { defaultTools, type Tool, type ToolContext, type DeviceProposal } from "./tools.js";
export { runAgent, DEFAULT_SYSTEM_PROMPT, type AgentOptions, type AgentResult } from "./agent.js";
export {
  bspTools,
  BSP_SYSTEM_PROMPT,
  type BspProposal,
  type BspToolContext,
} from "./bsp.js";
export { compileBsp, type BspFile, type BspCompileResult } from "./bsp-compile.js";
export { renderDiff } from "./diff.js";
export { mergeManifestComments } from "./merge.js";
