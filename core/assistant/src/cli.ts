#!/usr/bin/env node
// The assistant command line: openhome-assist ask "<prompt>" [--device <path>] [--apply].
// It loads the bring-your-own-key configuration from the environment, runs the grounded
// agent, prints the answer, and shows any proposed manifest as a diff. Applying a proposal
// requires --apply, which is the human-in-the-loop step; nothing is written otherwise.

import { readFile, writeFile } from "node:fs/promises";
import { loadConfigFromEnv, ConfigError } from "./config.js";
import { providerFromConfig, ProviderError } from "./providers/index.js";
import { defaultTools, type ToolContext } from "./tools.js";
import { runAgent } from "./agent.js";
import { renderDiff } from "./diff.js";
import { mergeManifestComments } from "./merge.js";

interface Args {
  command: string;
  prompt: string;
  device?: string;
  apply: boolean;
  maxSteps?: number;
}

function parseArgs(argv: string[]): Args {
  const positionals: string[] = [];
  let device: string | undefined;
  let apply = false;
  let maxSteps: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] ?? "";
    if (token === "--device") {
      device = argv[++i];
    } else if (token === "--apply") {
      apply = true;
    } else if (token === "--max-steps") {
      maxSteps = Number(argv[++i]);
    } else {
      positionals.push(token);
    }
  }
  const args: Args = { command: positionals[0] ?? "help", prompt: positionals.slice(1).join(" "), apply };
  if (device !== undefined) args.device = device;
  if (maxSteps !== undefined && Number.isFinite(maxSteps)) args.maxSteps = maxSteps;
  return args;
}

const USAGE = `openhome-assist - AI device development assistant

Usage:
  openhome-assist ask "<prompt>" [--device <path>] [--apply] [--max-steps <n>]

Configuration (environment):
  OPENHOME_LLM_PROVIDER   anthropic | gemini | openai-compatible (default anthropic)
  OPENHOME_LLM_API_KEY    your API key (omit only for a local base URL)
  OPENHOME_LLM_MODEL      model id (provider default otherwise)
  OPENHOME_LLM_BASE_URL   endpoint for openai-compatible (e.g. http://localhost:11434/v1)

Proposals are shown as a diff; re-run with --apply to write them to --device.`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command !== "ask" || args.prompt.length === 0) {
    console.log(USAGE);
    return args.command === "help" ? 0 : 1;
  }

  const config = loadConfigFromEnv();
  const provider = providerFromConfig(config);
  const context: ToolContext = { proposals: [], readFile: (path) => readFile(path, "utf8") };

  let prompt = args.prompt;
  if (args.device !== undefined) {
    prompt += `\n\nThe current device manifest is at \`${args.device}\`. Read it before proposing changes.`;
  }

  const result = await runAgent({
    provider,
    tools: defaultTools(),
    context,
    messages: [{ role: "user", content: prompt }],
    model: config.model,
    ...(args.maxSteps !== undefined ? { maxSteps: args.maxSteps } : {}),
  });

  console.log(result.answer);

  for (const proposal of result.proposals) {
    console.log(`\n--- proposed: ${proposal.deviceName ?? "device"} ---`);
    console.log(proposal.summary);
    console.log(`compiles, generates ${proposal.files.length} artifact(s)\n`);
    if (args.device !== undefined) {
      const current = await readFile(args.device, "utf8").catch(() => "");
      // Preserve the original file's comments and spacing on the parts that did not change.
      const finalYaml = current.length > 0 ? mergeManifestComments(current, proposal.yaml) : proposal.yaml;
      console.log(renderDiff(current, finalYaml));
      if (args.apply) {
        await writeFile(args.device, finalYaml, "utf8");
        console.log(`\napplied to ${args.device}`);
      } else {
        console.log(`\nre-run with --apply to write these changes to ${args.device}`);
      }
    } else {
      console.log(proposal.yaml);
    }
  }

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    if (error instanceof ConfigError || error instanceof ProviderError) {
      console.error(error.message);
    } else {
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    }
    process.exit(1);
  });
