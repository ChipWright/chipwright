#!/usr/bin/env node
// The assistant command line. Two grounded subcommands:
//   ask "<prompt>" [--device <path>] [--apply]   evolve a device manifest (DDL)
//   bsp "<chip>"   [--out <dir>]    [--apply]     draft a board support package (firmware)
// It loads the bring-your-own-key configuration from the environment, runs the grounded
// agent, and shows the result. Applying is the human-in-the-loop step: nothing is written
// unless --apply is passed.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadConfigFromEnv, ConfigError } from "./config.js";
import { providerFromConfig, ProviderError } from "./providers/index.js";
import { defaultTools, type ToolContext } from "./tools.js";
import { bspTools, BSP_SYSTEM_PROMPT, type BspToolContext } from "./bsp.js";
import { runAgent } from "./agent.js";
import { renderDiff } from "./diff.js";
import { mergeManifestComments } from "./merge.js";

interface Args {
  command: string;
  prompt: string;
  device?: string;
  out?: string;
  apply: boolean;
  maxSteps?: number;
}

function parseArgs(argv: string[]): Args {
  const positionals: string[] = [];
  let device: string | undefined;
  let out: string | undefined;
  let apply = false;
  let maxSteps: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] ?? "";
    if (token === "--device") {
      device = argv[++i];
    } else if (token === "--out") {
      out = argv[++i];
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
  if (out !== undefined) args.out = out;
  if (maxSteps !== undefined && Number.isFinite(maxSteps)) args.maxSteps = maxSteps;
  return args;
}

const USAGE = `openhome-assist - AI development assistant

Usage:
  openhome-assist ask "<prompt>" [--device <path>] [--apply] [--max-steps <n>]
  openhome-assist bsp "<chip or board>" [--out <dir>] [--apply] [--max-steps <n>]

Configuration (environment):
  OPENHOME_LLM_PROVIDER   anthropic | gemini | openai-compatible (default anthropic)
  OPENHOME_LLM_API_KEY    your API key (omit only for a local base URL)
  OPENHOME_LLM_MODEL      model id (provider default otherwise)
  OPENHOME_LLM_BASE_URL   endpoint for openai-compatible (e.g. http://localhost:11434/v1)

ask proposes a manifest, shown as a diff; re-run with --apply to write it to --device.
bsp drafts a board support package, verified to compile; re-run with --apply to write it to --out.`;

async function runAsk(args: Args, config: ReturnType<typeof loadConfigFromEnv>): Promise<number> {
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

async function runBsp(args: Args, config: ReturnType<typeof loadConfigFromEnv>): Promise<number> {
  const provider = providerFromConfig(config);
  const sdkFirmwareDir = resolve(process.cwd(), "sdk/firmware");
  const context: BspToolContext = { proposals: [], sdkFirmwareDir };

  const result = await runAgent({
    provider,
    tools: bspTools(),
    context,
    messages: [{ role: "user", content: `Draft a board support package for: ${args.prompt}` }],
    model: config.model,
    system: BSP_SYSTEM_PROMPT,
    ...(args.maxSteps !== undefined ? { maxSteps: args.maxSteps } : {}),
  });

  console.log(result.answer);

  for (const proposal of result.proposals) {
    console.log(`\n--- proposed BSP: ${proposal.board} ---`);
    console.log(proposal.summary);
    console.log(`compiles cleanly against the HAL, ${proposal.files.length} file(s):`);
    for (const file of proposal.files) {
      console.log(`  ${file.path}`);
    }
    const outDir = args.out ?? join(sdkFirmwareDir, "bsp", proposal.board);
    if (args.apply) {
      for (const file of proposal.files) {
        const target = join(outDir, file.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.content, "utf8");
      }
      console.log(`\napplied to ${outDir}`);
    } else {
      console.log(`\nre-run with --apply to write these files to ${outDir}`);
    }
  }
  return 0;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if ((args.command !== "ask" && args.command !== "bsp") || args.prompt.length === 0) {
    console.log(USAGE);
    return args.command === "help" ? 0 : 1;
  }

  const config = loadConfigFromEnv();
  return args.command === "bsp" ? runBsp(args, config) : runAsk(args, config);
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
