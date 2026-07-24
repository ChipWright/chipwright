// A provider that returns scripted completions in order, with no network. It is what makes
// the agent loop deterministically testable: a test scripts exactly what the "model" says
// on each turn (including tool calls) and asserts how the loop and tools respond. It also
// records every request it received so a test can inspect what the loop sent.

import type { Completion, CompletionRequest, LlmProvider } from "../types.js";

export class MockProvider implements LlmProvider {
  readonly name = "mock";
  readonly requests: CompletionRequest[] = [];
  private index = 0;

  constructor(private readonly scripted: Completion[]) {}

  complete(request: CompletionRequest): Promise<Completion> {
    this.requests.push(request);
    const next = this.scripted[this.index];
    this.index += 1;
    if (next === undefined) {
      return Promise.reject(new Error("MockProvider ran out of scripted completions"));
    }
    return Promise.resolve(next);
  }
}
