#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";

// src/ui/logger.ts
function isDebug() {
  return process.env.DEBUG === "1" || process.env.DEBUG === "counselors";
}
function debug(msg) {
  if (isDebug()) {
    process.stderr.write(`[debug] ${msg}
`);
  }
}
function warn(msg) {
  process.stderr.write(`\u26A0 ${msg}
`);
}
function error(msg) {
  process.stderr.write(`\u2717 ${msg}
`);
}
function info(msg) {
  process.stdout.write(`${msg}
`);
}
function success(msg) {
  process.stdout.write(`\u2713 ${msg}
`);
}

// src/commands/agent.ts
function registerAgentCommand(program2) {
  program2.command("agent").description("Print setup and skill installation instructions").action(async () => {
    const instructions = `# Counselors \u2014 Setup & Skill Installation

## 1. Install the CLI

\`\`\`bash
npm install -g counselors
\`\`\`

Requires Node 20+.

## 2. Configure tools

Auto-discover and configure all installed AI coding agents:

\`\`\`bash
counselors init --auto
\`\`\`

This detects installed agents (Claude, Codex, Gemini, Amp), configures them with recommended models, and writes your config to \`~/.config/counselors/config.json\`. The output is JSON listing what was configured.

You can also manage tools individually:

\`\`\`bash
counselors tools discover   # Find available agents
counselors tools add        # Add a tool (interactive)
counselors tools remove <id>  # Remove a tool
counselors tools rename <old> <new>  # Rename a tool
counselors ls               # List configured tools
counselors doctor           # Verify tools are working
\`\`\`

## 3. Install the skill

The \`/counselors\` skill lets AI coding agents invoke counselors directly via a slash command.

Run \`counselors skill\` to print a reference template with instructions. **Read the output carefully** \u2014 it describes a multi-phase workflow that you need to adapt to your agent's skill format before saving. Do not blindly copy the output into a file.

For Claude Code, save the adapted skill to \`~/.claude/skills/counselors/SKILL.md\`. For other agents, save it wherever your system looks for slash commands or skills.

## 4. Verify

\`\`\`bash
counselors doctor
\`\`\`

Then use \`/counselors\` from your AI coding agent to fan out a prompt for parallel review.
`;
    info(instructions);
  });
}

// src/commands/cleanup.ts
import { resolve as resolve2 } from "path";

// src/core/cleanup.ts
import { existsSync, lstatSync, readdirSync, rmSync } from "fs";
import { join } from "path";
var MS = 1;
var SECOND = 1e3 * MS;
var MINUTE = 60 * SECOND;
var HOUR = 60 * MINUTE;
var DAY = 24 * HOUR;
var WEEK = 7 * DAY;
function parseDurationMs(input2) {
  const raw = input2.trim();
  if (!raw) throw new Error("Duration cannot be empty.");
  if (/^\d+$/.test(raw)) {
    const days = Number(raw);
    if (!Number.isFinite(days) || days < 0) {
      throw new Error(`Invalid duration "${input2}".`);
    }
    return days * DAY;
  }
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/i.exec(raw);
  if (!m) {
    throw new Error(
      `Invalid duration "${input2}". Use e.g. "1d", "12h", "30m", "45s".`
    );
  }
  const value = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid duration "${input2}".`);
  }
  const multipliers = {
    ms: MS,
    s: SECOND,
    m: MINUTE,
    h: HOUR,
    d: DAY,
    w: WEEK
  };
  const mult = multipliers[unit];
  if (!mult) throw new Error(`Invalid duration unit in "${input2}".`);
  return value * mult;
}
function scanCleanupCandidates(baseDir, cutoffMs) {
  if (!existsSync(baseDir)) {
    return { baseExists: false, candidates: [], skippedSymlinks: [] };
  }
  const skippedSymlinks = [];
  const candidates = [];
  for (const name of readdirSync(baseDir)) {
    const fullPath = join(baseDir, name);
    let st;
    try {
      st = lstatSync(fullPath);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      skippedSymlinks.push(name);
      continue;
    }
    if (!st.isDirectory()) continue;
    if (st.mtimeMs < cutoffMs) {
      candidates.push({ name, path: fullPath, mtimeMs: st.mtimeMs });
    }
  }
  candidates.sort((a, b) => a.mtimeMs - b.mtimeMs);
  return { baseExists: true, candidates, skippedSymlinks };
}
function deleteCleanupCandidates(candidates) {
  const deleted = [];
  const failed = [];
  for (const c of candidates) {
    try {
      rmSync(c.path, { recursive: true, force: true });
      deleted.push(c.path);
    } catch (e) {
      failed.push({
        path: c.path,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }
  return { deleted, failed };
}

// src/core/config.ts
import { existsSync as existsSync2, mkdirSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { z as z2 } from "zod";

// src/constants.ts
import { homedir } from "os";
import { join as join2 } from "path";
var xdgConfig = process.env.XDG_CONFIG_HOME || join2(homedir(), ".config");
var CONFIG_DIR = join2(xdgConfig, "counselors");
var CONFIG_FILE = join2(CONFIG_DIR, "config.json");
var AMP_SETTINGS_FILE = join2(CONFIG_DIR, "amp-readonly-settings.json");
var AMP_DEEP_SETTINGS_FILE = join2(
  CONFIG_DIR,
  "amp-deep-settings.json"
);
var KILL_GRACE_PERIOD = 15e3;
var TEST_TIMEOUT = 3e4;
var DISCOVERY_TIMEOUT = 5e3;
var VERSION_TIMEOUT = 1e4;
var DEFAULT_MAX_CONTEXT_KB = 50;
function getExtendedSearchPaths() {
  const home = homedir();
  const paths = [
    join2(home, ".local", "bin"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
    join2(home, ".npm-global", "bin"),
    join2(home, ".volta", "bin"),
    join2(home, ".bun", "bin")
  ];
  const nvmBin = process.env.NVM_BIN;
  if (nvmBin) paths.push(nvmBin);
  const fnmMultishell = process.env.FNM_MULTISHELL_PATH;
  if (fnmMultishell) paths.push(join2(fnmMultishell, "bin"));
  return paths;
}
var MAX_SLUG_LENGTH = 40;
var CONFIG_FILE_MODE = 384;
function sanitizeId(id) {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}
var SAFE_ID_RE = /^[a-zA-Z0-9._-]+$/;
function sanitizePath(p) {
  return p.replace(/[\x00-\x08\x0A-\x1F]/g, "");
}
var VERSION = true ? "0.7.2" : "0.0.0-dev";

// src/types.ts
import { z } from "zod";
var ToolConfigSchema = z.object({
  binary: z.string(),
  adapter: z.string().optional(),
  readOnly: z.object({
    level: z.enum(["enforced", "bestEffort", "none"]),
    flags: z.array(z.string()).optional()
  }),
  extraFlags: z.array(z.string()).optional(),
  timeout: z.number().optional(),
  stdin: z.boolean().optional(),
  custom: z.boolean().optional()
});
var ConfigSchema = z.object({
  version: z.literal(1),
  defaults: z.object({
    timeout: z.number().default(900),
    outputDir: z.string().default("./agents/counselors"),
    readOnly: z.enum(["enforced", "bestEffort", "none"]).default("bestEffort"),
    maxContextKb: z.number().default(50),
    maxParallel: z.number().default(4)
  }).default({}),
  tools: z.record(z.string(), ToolConfigSchema).default({}),
  groups: z.record(z.string(), z.array(z.string())).default({})
});

// src/core/fs-utils.ts
import { randomUUID } from "crypto";
import { renameSync, unlinkSync, writeFileSync } from "fs";
function safeWriteFile(path, content, options) {
  const tmp = `${path}.tmp.${randomUUID().slice(0, 8)}`;
  try {
    writeFileSync(tmp, content, { encoding: "utf-8", mode: options?.mode });
    renameSync(tmp, path);
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {
    }
    throw e;
  }
}

// src/core/config.ts
var READ_ONLY_STRICTNESS = {
  none: 0,
  bestEffort: 1,
  enforced: 2
};
function stricterReadOnly(a, b) {
  return READ_ONLY_STRICTNESS[a] >= READ_ONLY_STRICTNESS[b] ? a : b;
}
var DEFAULT_CONFIG = {
  version: 1,
  defaults: {
    timeout: 900,
    outputDir: "./agents/counselors",
    readOnly: "bestEffort",
    maxContextKb: 50,
    maxParallel: 4
  },
  tools: {},
  groups: {}
};
function loadConfig(globalPath) {
  const path = globalPath ?? CONFIG_FILE;
  if (!existsSync2(path)) return { ...DEFAULT_CONFIG };
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    throw new Error(
      `Invalid JSON in ${path}: ${e instanceof Error ? e.message : e}`
    );
  }
  return ConfigSchema.parse(raw);
}
var ProjectConfigSchema = z2.object({
  defaults: z2.object({
    timeout: z2.number().optional(),
    outputDir: z2.string().optional(),
    readOnly: z2.enum(["enforced", "bestEffort", "none"]).optional(),
    maxContextKb: z2.number().optional(),
    maxParallel: z2.number().optional()
  }).optional()
});
function loadProjectConfig(cwd) {
  const path = resolve(cwd, ".counselors.json");
  if (!existsSync2(path)) return null;
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    throw new Error(
      `Invalid JSON in ${path}: ${e instanceof Error ? e.message : e}`
    );
  }
  return ProjectConfigSchema.parse(raw);
}
function mergeConfigs(global, project, cliFlags) {
  const merged = {
    version: 1,
    defaults: { ...global.defaults },
    tools: { ...global.tools },
    groups: { ...global.groups }
  };
  if (project) {
    if (project.defaults) {
      merged.defaults = { ...merged.defaults, ...project.defaults };
      merged.defaults.readOnly = stricterReadOnly(
        global.defaults.readOnly,
        merged.defaults.readOnly
      );
    }
  }
  if (cliFlags) {
    merged.defaults = { ...merged.defaults, ...cliFlags };
  }
  return merged;
}
function saveConfig(config, path) {
  const filePath = path ?? CONFIG_FILE;
  mkdirSync(dirname(filePath), { recursive: true });
  safeWriteFile(filePath, `${JSON.stringify(config, null, 2)}
`, {
    mode: CONFIG_FILE_MODE
  });
}
function addToolToConfig(config, id, tool) {
  return {
    ...config,
    tools: { ...config.tools, [id]: tool }
  };
}
function removeToolFromConfig(config, id) {
  const tools2 = { ...config.tools };
  delete tools2[id];
  const groups2 = Object.fromEntries(
    Object.entries(config.groups).map(([name, toolIds]) => [name, toolIds.filter((t) => t !== id)]).filter(([, ids]) => ids.length > 0)
  );
  return { ...config, tools: tools2, groups: groups2 };
}
function renameToolInConfig(config, oldId, newId) {
  const tools2 = { ...config.tools };
  tools2[newId] = tools2[oldId];
  delete tools2[oldId];
  const groups2 = Object.fromEntries(
    Object.entries(config.groups).map(([name, toolIds]) => [
      name,
      toolIds.map((t) => t === oldId ? newId : t)
    ])
  );
  return { ...config, tools: tools2, groups: groups2 };
}
function addGroupToConfig(config, name, toolIds) {
  return {
    ...config,
    groups: { ...config.groups, [name]: [...toolIds] }
  };
}
function removeGroupFromConfig(config, name) {
  const groups2 = { ...config.groups };
  delete groups2[name];
  return { ...config, groups: groups2 };
}

// src/ui/prompts.ts
import { checkbox, confirm, input, select } from "@inquirer/prompts";
async function selectModelDetails(toolId, models) {
  const choices = models.map((m, i) => ({
    name: m.recommended ? `${m.name} (Recommended)` : m.name,
    value: String(i)
  }));
  choices.push({ name: "Custom model...", value: "__custom__" });
  const idx = await select({
    message: `Select model for ${toolId}:`,
    choices
  });
  if (idx === "__custom__") {
    return { id: "__custom__" };
  }
  const model = models[Number(idx)];
  return {
    id: model.id,
    compoundId: model.compoundId,
    extraFlags: model.extraFlags
  };
}
async function selectModels(toolId, models) {
  const choices = models.map((m) => ({
    name: m.recommended ? `${m.name} (Recommended)` : m.name,
    value: { id: m.id, compoundId: m.compoundId, extraFlags: m.extraFlags },
    checked: m.recommended
  }));
  return checkbox({
    message: `Select models for ${toolId}:`,
    choices
  });
}
async function selectTools(tools2) {
  const choices = tools2.map((t) => ({
    name: t.found ? `${t.name} \u2014 found` : `${t.name} \u2014 not found`,
    value: t.id,
    checked: t.found,
    disabled: !t.found ? "(not installed)" : void 0
  }));
  return checkbox({
    message: "Which tools should be configured?",
    choices
  });
}
async function confirmOverwrite(toolId) {
  return confirm({
    message: `Tool "${toolId}" already exists. Overwrite?`,
    default: false
  });
}
async function selectRunTools(tools2) {
  const choices = tools2.map((id) => ({
    name: id,
    value: id,
    checked: true
  }));
  return checkbox({
    message: "Select tools to dispatch:",
    choices
  });
}
async function confirmAction(message) {
  return confirm({ message, default: true });
}
async function promptInput(message, defaultValue) {
  return input({ message, default: defaultValue });
}
async function promptSelect(message, choices) {
  return select({ message, choices });
}

// src/commands/cleanup.ts
function formatDurationForHumans(ms) {
  const s = Math.round(ms / 1e3);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}
function registerCleanupCommand(program2) {
  program2.command("cleanup").description("Delete run output directories older than a given age").option(
    "--older-than <duration>",
    "Delete runs older than this age (e.g. 1d, 12h, 30m, 2w, 500ms). Defaults to 1d. A bare number is days.",
    "1d"
  ).option(
    "-o, --output-dir <dir>",
    "Base output directory (overrides config)"
  ).option("--dry-run", "Show what would be deleted without removing files").option("-y, --yes", "Do not prompt for confirmation").option("--json", "Output results as JSON").action(
    async (opts) => {
      const cwd = process.cwd();
      const globalConfig = loadConfig();
      const projectConfig = loadProjectConfig(cwd);
      const config = mergeConfigs(globalConfig, projectConfig);
      let olderThanMs;
      try {
        olderThanMs = parseDurationMs(opts.olderThan);
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        process.exitCode = 1;
        return;
      }
      if (!Number.isFinite(olderThanMs) || olderThanMs < 0) {
        error(`Invalid --older-than value "${opts.olderThan}".`);
        process.exitCode = 1;
        return;
      }
      const baseDir = opts.outputDir || config.defaults.outputDir;
      const absBaseDir = resolve2(cwd, baseDir);
      const cutoffMs = Date.now() - olderThanMs;
      const { baseExists, candidates, skippedSymlinks } = scanCleanupCandidates(absBaseDir, cutoffMs);
      if (!baseExists) {
        info(`No output directory found at: ${absBaseDir}`);
        return;
      }
      if (skippedSymlinks.length > 0) {
        warn(
          `Skipping ${skippedSymlinks.length} symlink(s) in output dir for safety.`
        );
      }
      if (candidates.length === 0) {
        info(
          `No run output directories older than ${formatDurationForHumans(
            olderThanMs
          )} to clean up.`
        );
        return;
      }
      if (opts.dryRun) {
        if (opts.json) {
          info(
            JSON.stringify(
              {
                baseDir: absBaseDir,
                olderThan: opts.olderThan,
                candidates: candidates.map((c) => ({
                  name: c.name,
                  path: c.path,
                  mtimeMs: c.mtimeMs
                }))
              },
              null,
              2
            )
          );
        } else {
          info(
            `Dry run: would delete ${candidates.length} director${candidates.length === 1 ? "y" : "ies"} under ${absBaseDir}`
          );
          for (const c of candidates) {
            info(`- ${c.name}`);
          }
        }
        return;
      }
      if (!opts.yes) {
        if (!process.stderr.isTTY) {
          error(
            "Refusing to delete in non-interactive mode without --yes. Re-run with --dry-run to preview."
          );
          process.exitCode = 1;
          return;
        }
        const ok = await confirmAction(
          `Delete ${candidates.length} director${candidates.length === 1 ? "y" : "ies"} under ${absBaseDir} older than ${formatDurationForHumans(
            olderThanMs
          )}?`
        );
        if (!ok) {
          info("Aborted.");
          return;
        }
      }
      const result = deleteCleanupCandidates(candidates);
      if (opts.json) {
        info(
          JSON.stringify(
            {
              baseDir: absBaseDir,
              olderThan: opts.olderThan,
              deleted: result.deleted,
              failed: result.failed
            },
            null,
            2
          )
        );
      } else {
        if (result.deleted.length > 0) {
          success(
            `Deleted ${result.deleted.length} director${result.deleted.length === 1 ? "y" : "ies"}.`
          );
        }
        if (result.failed.length > 0) {
          error(
            `Failed to delete ${result.failed.length} director${result.failed.length === 1 ? "y" : "ies"}.`
          );
          for (const f of result.failed) {
            warn(`${f.path}: ${f.error}`);
          }
          process.exitCode = 1;
        }
      }
    }
  );
}

// src/commands/config.ts
function registerConfigCommand(program2) {
  program2.command("config").description("Show resolved configuration").action(() => {
    info(`Config file: ${CONFIG_FILE}
`);
    const config = loadConfig();
    info(JSON.stringify(config, null, 2));
  });
}

// src/commands/doctor.ts
import { existsSync as existsSync6 } from "fs";
import { join as join5 } from "path";

// src/adapters/amp.ts
import { existsSync as existsSync3 } from "fs";

// src/core/text-utils.ts
function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}
function buildToolReport(toolId, result) {
  return {
    toolId,
    status: result.timedOut ? "timeout" : result.exitCode === 0 ? "success" : "error",
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    wordCount: countWords(result.stdout),
    outputFile: "",
    stderrFile: "",
    error: result.exitCode !== 0 ? result.stderr.slice(0, 500) : void 0
  };
}

// src/adapters/base.ts
var BaseAdapter = class {
  modelFlag = "-m";
  getEffectiveReadOnlyLevel(_toolConfig) {
    return this.readOnly.level;
  }
  parseResult(result) {
    return {
      status: result.timedOut ? "timeout" : result.exitCode === 0 ? "success" : "error",
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      wordCount: countWords(result.stdout)
    };
  }
};

// src/adapters/amp.ts
function isAmpDeepMode(flags) {
  if (!flags) return false;
  const idx = flags.indexOf("deep");
  return idx > 0 && flags[idx - 1] === "-m";
}
var AmpAdapter = class extends BaseAdapter {
  id = "amp";
  displayName = "Amp CLI";
  commands = ["amp"];
  installUrl = "https://ampcode.com";
  readOnly = { level: "enforced" };
  models = [
    {
      id: "smart",
      name: "Smart \u2014 Opus 4.6, most capable",
      recommended: true,
      extraFlags: ["-m", "smart"]
    },
    {
      id: "deep",
      name: "Deep \u2014 GPT-5.2 Codex, extended thinking",
      extraFlags: ["-m", "deep"]
    }
  ];
  getEffectiveReadOnlyLevel(toolConfig) {
    return isAmpDeepMode(toolConfig.extraFlags) ? "bestEffort" : this.readOnly.level;
  }
  buildInvocation(req) {
    const args = ["-x"];
    if (req.extraFlags) {
      args.push(...req.extraFlags);
    }
    const isDeep = isAmpDeepMode(req.extraFlags);
    const settingsFile = isDeep ? AMP_DEEP_SETTINGS_FILE : AMP_SETTINGS_FILE;
    if (req.readOnlyPolicy !== "none" && existsSync3(settingsFile)) {
      args.push("--settings-file", settingsFile);
    }
    const deepSafetyPrompt = isDeep ? "\n\nMANDATORY: Do not change any files. You are in read-only mode." : "";
    const stdinContent = req.prompt + deepSafetyPrompt + "\n\nUse the oracle tool to provide deeper reasoning and analysis on the most complex or critical aspects of this review.";
    return {
      cmd: req.binary ?? "amp",
      args,
      stdin: stdinContent,
      cwd: req.cwd
    };
  }
  parseResult(result) {
    return {
      ...super.parseResult(result)
    };
  }
};
function parseAmpUsage(output) {
  const freeMatch = output.match(/Amp Free: \$([0-9.]+)\/\$([0-9.]+)/);
  const creditsMatch = output.match(/Individual credits: \$([0-9.]+)/);
  return {
    freeRemaining: freeMatch ? parseFloat(freeMatch[1]) : 0,
    freeTotal: freeMatch ? parseFloat(freeMatch[2]) : 0,
    creditsRemaining: creditsMatch ? parseFloat(creditsMatch[1]) : 0
  };
}
function computeAmpCost(before, after) {
  const freeUsed = Math.max(0, before.freeRemaining - after.freeRemaining);
  const creditsUsed = Math.max(
    0,
    before.creditsRemaining - after.creditsRemaining
  );
  const totalCost = freeUsed + creditsUsed;
  const source = creditsUsed > 0 ? "credits" : "free";
  return {
    cost_usd: Math.round(totalCost * 100) / 100,
    free_used_usd: Math.round(freeUsed * 100) / 100,
    credits_used_usd: Math.round(creditsUsed * 100) / 100,
    source,
    free_remaining_usd: after.freeRemaining,
    free_total_usd: after.freeTotal,
    credits_remaining_usd: after.creditsRemaining
  };
}

// src/adapters/claude.ts
var ClaudeAdapter = class extends BaseAdapter {
  id = "claude";
  displayName = "Claude Code";
  commands = ["claude"];
  installUrl = "https://docs.anthropic.com/en/docs/claude-code";
  readOnly = { level: "enforced" };
  modelFlag = "--model";
  models = [
    {
      id: "opus",
      name: "Opus 4.6 \u2014 most capable",
      recommended: true,
      extraFlags: ["--model", "opus"]
    },
    {
      id: "sonnet",
      name: "Sonnet 4.5 \u2014 fast and capable",
      extraFlags: ["--model", "sonnet"]
    },
    {
      id: "haiku",
      name: "Haiku 4.5 \u2014 fastest, most affordable",
      extraFlags: ["--model", "haiku"]
    }
  ];
  buildInvocation(req) {
    const instruction = `Read the file at ${sanitizePath(req.promptFilePath)} and follow the instructions within it.`;
    const args = ["-p", "--output-format", "text"];
    if (req.extraFlags) {
      args.push(...req.extraFlags);
    }
    if (req.readOnlyPolicy !== "none") {
      args.push(
        "--tools",
        "Read,Glob,Grep,WebFetch,WebSearch",
        "--allowedTools",
        "Read,Glob,Grep,WebFetch,WebSearch",
        "--strict-mcp-config"
      );
    }
    args.push(instruction);
    return { cmd: req.binary ?? "claude", args, cwd: req.cwd };
  }
};

// src/adapters/codex.ts
var CodexAdapter = class extends BaseAdapter {
  id = "codex";
  displayName = "OpenAI Codex";
  commands = ["codex"];
  installUrl = "https://github.com/openai/codex";
  readOnly = { level: "enforced" };
  models = [
    {
      id: "gpt-5.4",
      compoundId: "codex-5.4-high",
      name: "GPT-5.4 \u2014 high reasoning",
      recommended: true,
      extraFlags: ["-m", "gpt-5.4", "-c", "model_reasoning_effort=high"]
    },
    {
      id: "gpt-5.4",
      compoundId: "codex-5.4-xhigh",
      name: "GPT-5.4 \u2014 xhigh reasoning",
      extraFlags: ["-m", "gpt-5.4", "-c", "model_reasoning_effort=xhigh"]
    },
    {
      id: "gpt-5.4",
      compoundId: "codex-5.4-medium",
      name: "GPT-5.4 \u2014 medium reasoning",
      extraFlags: ["-m", "gpt-5.4", "-c", "model_reasoning_effort=medium"]
    }
  ];
  buildInvocation(req) {
    const instruction = `Read the file at ${sanitizePath(req.promptFilePath)} and follow the instructions within it.`;
    const args = ["exec"];
    if (req.readOnlyPolicy !== "none") {
      args.push("--sandbox", "read-only");
    }
    args.push("-c", "web_search=live", "--skip-git-repo-check");
    if (req.extraFlags) {
      args.push(...req.extraFlags);
    }
    args.push(instruction);
    return { cmd: req.binary ?? "codex", args, cwd: req.cwd };
  }
};

// src/adapters/custom.ts
var CustomAdapter = class extends BaseAdapter {
  id;
  displayName;
  commands;
  installUrl = "";
  readOnly;
  models = [];
  config;
  constructor(id, config) {
    super();
    this.id = id;
    this.displayName = id;
    this.commands = [config.binary];
    this.readOnly = { level: config.readOnly.level };
    this.config = config;
  }
  buildInvocation(req) {
    const args = [];
    if (req.extraFlags) {
      args.push(...req.extraFlags);
    }
    if (req.readOnlyPolicy !== "none" && this.config.readOnly.flags) {
      args.push(...this.config.readOnly.flags);
    }
    const cmd = req.binary ?? this.config.binary;
    if (this.config.stdin === true) {
      return { cmd, args, stdin: req.prompt, cwd: req.cwd };
    }
    const instruction = `Read the file at ${sanitizePath(req.promptFilePath)} and follow the instructions within it.`;
    args.push(instruction);
    return { cmd, args, cwd: req.cwd };
  }
};

// src/adapters/gemini.ts
var GeminiAdapter = class extends BaseAdapter {
  id = "gemini";
  displayName = "Gemini CLI";
  commands = ["gemini"];
  installUrl = "https://github.com/google-gemini/gemini-cli";
  readOnly = { level: "enforced" };
  models = [
    {
      id: "gemini-3.1-pro",
      name: "Gemini 3.1 Pro \u2014 latest",
      recommended: true,
      extraFlags: ["-m", "gemini-3.1-pro"]
    },
    {
      id: "gemini-3-pro",
      name: "Gemini 3 Pro",
      extraFlags: ["-m", "gemini-3-pro-preview"]
    },
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro \u2014 stable GA",
      extraFlags: ["-m", "gemini-2.5-pro"]
    },
    {
      id: "gemini-3-flash",
      name: "Gemini 3 Flash \u2014 fast",
      extraFlags: ["-m", "gemini-3-flash-preview"]
    },
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash \u2014 fast GA",
      extraFlags: ["-m", "gemini-2.5-flash"]
    }
  ];
  buildInvocation(req) {
    const args = ["-p", ""];
    if (req.extraFlags) {
      args.push(...req.extraFlags);
    }
    if (req.readOnlyPolicy !== "none") {
      args.push(
        "--extensions",
        "",
        "--allowed-tools",
        "read_file",
        "list_directory",
        "search_file_content",
        "glob",
        "google_web_search",
        "codebase_investigator"
      );
    }
    args.push("--output-format", "text");
    const prompt = req.prompt + '\n\nIMPORTANT: Do not narrate your tool usage, internal planning, or chain of thought. Start your response directly with your analysis. Do not prefix your response with lines like "I will read..." or "I will list...".';
    return {
      cmd: req.binary ?? "gemini",
      args,
      stdin: prompt,
      cwd: req.cwd
    };
  }
};

// src/adapters/openrouter.ts
import { readFileSync as readFileSync2 } from "fs";
import { basename } from "path";
function resolveFileRefs(prompt) {
  return prompt.replace(/^@(.+\.md)$/gm, (_match, filePath) => {
    try {
      const content = readFileSync2(filePath, "utf-8");
      const label = basename(filePath);
      return `--- ${label} ---
${content}
--- end ${label} ---`;
    } catch (e) {
      debug(
        `Could not resolve file ref "${filePath}": ${e instanceof Error ? e.message : String(e)}`
      );
      return _match;
    }
  });
}
var OpenRouterAdapter = class extends BaseAdapter {
  id = "openrouter";
  displayName = "OpenRouter";
  commands = ["openrouter-agent"];
  installUrl = "https://github.com/skinnyandbald/counselors#using-openrouter-single-api-key-for-all-models";
  readOnly = { level: "enforced" };
  modelFlag = "--model";
  models = [
    {
      id: "claude-opus",
      name: "Claude Opus 4 \u2014 most capable (Anthropic)",
      recommended: true,
      compoundId: "or-claude-opus",
      extraFlags: ["--model", "anthropic/claude-opus-4"]
    },
    {
      id: "gemini-3.1-pro",
      name: "Gemini 3.1 Pro \u2014 fast and capable (Google)",
      recommended: true,
      compoundId: "or-gemini-3.1-pro",
      extraFlags: ["--model", "google/gemini-3.1-pro-preview"]
    },
    {
      id: "codex-5.4",
      name: "Codex 5.4 / GPT-5.4 \u2014 latest reasoning model (OpenAI)",
      recommended: true,
      compoundId: "or-codex-5.4",
      extraFlags: ["--model", "openai/gpt-5.4"]
    },
    {
      id: "claude-sonnet",
      name: "Claude Sonnet 4 \u2014 fast and capable (Anthropic)",
      compoundId: "or-claude-sonnet",
      extraFlags: ["--model", "anthropic/claude-sonnet-4"]
    },
    {
      id: "gpt-4o",
      name: "GPT-4o \u2014 fast multimodal (OpenAI)",
      compoundId: "or-gpt-4o",
      extraFlags: ["--model", "openai/gpt-4o"]
    },
    {
      id: "llama-4-maverick",
      name: "Llama 4 Maverick \u2014 open source (Meta)",
      compoundId: "or-llama-4-maverick",
      extraFlags: ["--model", "meta-llama/llama-4-maverick"]
    },
    {
      id: "grok-4.20",
      name: "Grok 4.20 Beta \u2014 reasoning flagship (xAI)",
      compoundId: "or-grok-4.20",
      extraFlags: ["--model", "x-ai/grok-4.20-beta"]
    }
  ];
  buildInvocation(req) {
    const args = [];
    if (req.extraFlags) {
      args.push(...req.extraFlags);
    }
    return {
      cmd: req.binary ?? "openrouter-agent",
      args,
      stdin: resolveFileRefs(req.prompt),
      cwd: req.cwd
    };
  }
};

// src/adapters/index.ts
var builtInAdapters = {
  claude: () => new ClaudeAdapter(),
  codex: () => new CodexAdapter(),
  gemini: () => new GeminiAdapter(),
  amp: () => new AmpAdapter(),
  openrouter: () => new OpenRouterAdapter()
};
function getAdapter(id, config) {
  if (builtInAdapters[id]) {
    return builtInAdapters[id]();
  }
  if (config) {
    return new CustomAdapter(id, config);
  }
  throw new Error(
    `Unknown tool: ${id}. Use "counselors tools add" to configure it.`
  );
}
function getAllBuiltInAdapters() {
  return Object.values(builtInAdapters).map((fn) => fn());
}
function isBuiltInTool(id) {
  return id in builtInAdapters;
}
function resolveAdapter(id, toolConfig) {
  const baseId = toolConfig.adapter ?? id;
  return isBuiltInTool(baseId) ? getAdapter(baseId) : new CustomAdapter(id, toolConfig);
}

// src/core/discovery.ts
import { execFileSync } from "child_process";
import {
  accessSync,
  constants,
  existsSync as existsSync4,
  readdirSync as readdirSync2,
  readFileSync as readFileSync3,
  statSync
} from "fs";
import { homedir as homedir2 } from "os";
import { delimiter, join as join3 } from "path";
import crossSpawn from "cross-spawn";
var DEFAULT_WINDOWS_EXTENSIONS = [".com", ".exe", ".bat", ".cmd"];
function getWindowsExecutableExtensions(pathext = process.env.PATHEXT) {
  const parsed = (pathext ?? DEFAULT_WINDOWS_EXTENSIONS.join(";")).split(";").map((ext) => ext.trim().toLowerCase()).filter(Boolean).map((ext) => ext.startsWith(".") ? ext : `.${ext}`);
  const unique = [...new Set(parsed)];
  for (const required of DEFAULT_WINDOWS_EXTENSIONS) {
    if (!unique.includes(required)) unique.push(required);
  }
  return unique;
}
function buildBinaryCandidatesForScan(dir, command, platform = process.platform, pathext = process.env.PATHEXT) {
  if (platform !== "win32") {
    return [join3(dir, command)];
  }
  const lowerCommand = command.toLowerCase();
  const extensions = getWindowsExecutableExtensions(pathext);
  const hasKnownExtension = extensions.some(
    (ext) => lowerCommand.endsWith(ext)
  );
  if (hasKnownExtension) {
    return [join3(dir, command)];
  }
  return [
    ...extensions.map((ext) => join3(dir, `${command}${ext}`)),
    join3(dir, command)
  ];
}
function findBinary(command) {
  const lookupCmd = process.platform === "win32" ? "where" : "which";
  try {
    const result = execFileSync(lookupCmd, [command], {
      timeout: DISCOVERY_TIMEOUT,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8"
    }).trim().split("\n")[0].trim();
    if (result) return result;
  } catch {
  }
  const searchPaths = [
    ...getPathEntries(),
    ...getExtendedSearchPaths(),
    ...getNvmPaths(),
    ...getFnmPaths()
  ];
  const uniqueSearchPaths = [...new Set(searchPaths)];
  const accessMode = process.platform === "win32" ? constants.F_OK : constants.X_OK;
  for (const dir of uniqueSearchPaths) {
    for (const candidate of buildBinaryCandidatesForScan(dir, command)) {
      try {
        accessSync(candidate, accessMode);
        return candidate;
      } catch {
      }
    }
  }
  return null;
}
function getPathEntries(pathEnv = process.env.PATH) {
  if (!pathEnv) return [];
  return pathEnv.split(delimiter).map((entry) => entry.trim().replace(/^"(.*)"$/, "$1")).filter(Boolean);
}
function getNvmPaths() {
  const home = homedir2();
  const nvmDir = join3(home, ".nvm");
  const aliasFile = join3(nvmDir, "alias", "default");
  if (!existsSync4(aliasFile)) return [];
  try {
    let alias = readFileSync3(aliasFile, "utf-8").trim();
    if (alias.startsWith("lts/")) {
      const ltsName = alias.slice(4);
      const ltsFile = join3(nvmDir, "alias", "lts", ltsName);
      if (existsSync4(ltsFile)) {
        alias = readFileSync3(ltsFile, "utf-8").trim();
      }
    }
    const versionsDir = join3(nvmDir, "versions", "node");
    if (!existsSync4(versionsDir)) return [];
    const versions = readdirSync2(versionsDir);
    const match = versions.find((v) => v.startsWith(`v${alias}`));
    if (match) {
      return [join3(versionsDir, match, "bin")];
    }
  } catch {
  }
  return [];
}
function getFnmPaths() {
  const home = homedir2();
  const multishellDir = join3(home, ".local", "state", "fnm_multishells");
  const paths = [];
  const fnmDir = join3(home, ".local", "share", "fnm");
  if (existsSync4(fnmDir)) {
    const aliasDir = join3(fnmDir, "aliases");
    if (existsSync4(aliasDir)) {
      try {
        for (const alias of readdirSync2(aliasDir)) {
          const binDir = join3(aliasDir, alias, "bin");
          if (existsSync4(binDir)) paths.push(binDir);
        }
      } catch {
      }
    }
  }
  if (!existsSync4(multishellDir)) return paths;
  try {
    const entries = readdirSync2(multishellDir).map((name) => {
      const full = join3(multishellDir, name);
      try {
        return { name: full, mtime: statSync(full).mtimeMs };
      } catch {
        return null;
      }
    }).filter((e) => e !== null).sort((a, b) => b.mtime - a.mtime).slice(0, 5);
    for (const entry of entries) {
      const binDir = join3(entry.name, "bin");
      if (existsSync4(binDir)) {
        paths.push(binDir);
      }
    }
  } catch {
  }
  return paths;
}
function getBinaryVersion(binaryPath) {
  const result = crossSpawn.sync(binaryPath, ["--version"], {
    timeout: VERSION_TIMEOUT,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
    shell: false,
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    return null;
  }
  const output = String(result.stdout ?? "").trim();
  const firstLine = output.split("\n")[0].trim();
  return firstLine || null;
}
function discoverTool(commands) {
  for (const cmd of commands) {
    const path = findBinary(cmd);
    if (path) {
      const version = getBinaryVersion(path);
      return { toolId: cmd, found: true, path, version, command: cmd };
    }
  }
  return {
    toolId: commands[0],
    found: false,
    path: null,
    version: null,
    command: commands[0]
  };
}

// src/core/upgrade.ts
import { execFileSync as execFileSync2, spawnSync } from "child_process";
import { createHash } from "crypto";
import {
  accessSync as accessSync2,
  chmodSync,
  constants as constants2,
  existsSync as existsSync5,
  lstatSync as lstatSync2,
  readFileSync as readFileSync4,
  realpathSync,
  renameSync as renameSync2,
  rmSync as rmSync2,
  unlinkSync as unlinkSync2,
  writeFileSync as writeFileSync2
} from "fs";
import { homedir as homedir3 } from "os";
import { dirname as dirname2, join as join4, resolve as resolve3 } from "path";
function parseBrewVersion(output) {
  const trimmed = output.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^counselors\s+([^\s]+)/m);
  return match?.[1] ?? null;
}
function parseNpmLsVersion(output) {
  if (!output.trim()) return null;
  try {
    const parsed = JSON.parse(output);
    const version = parsed.dependencies?.counselors?.version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}
function getStandaloneAssetName(platform = process.platform, arch = process.arch) {
  let os;
  if (platform === "darwin") {
    os = "darwin";
  } else if (platform === "linux") {
    os = "linux";
  } else {
    return null;
  }
  let normalizedArch;
  if (arch === "x64") {
    normalizedArch = "x64";
  } else if (arch === "arm64") {
    normalizedArch = "arm64";
  } else {
    return null;
  }
  return `counselors-${os}-${normalizedArch}`;
}
function getSafeStandaloneRoots(homeDir) {
  const roots = [
    normalizePath(join4(homeDir, ".local", "bin")),
    normalizePath(join4(homeDir, "bin"))
  ];
  return roots.filter((r) => Boolean(r));
}
function isSafeStandalonePath(path, homeDir) {
  if (!path) return false;
  const normalized = normalizePath(path);
  if (!normalized) return false;
  return getSafeStandaloneRoots(homeDir).some(
    (root) => normalized === root || normalized.startsWith(`${root}/`)
  );
}
function isLikelyPnpmInstall(binaryPath, resolvedBinaryPath, homeDir) {
  const candidates = [binaryPath, resolvedBinaryPath].map((p) => normalizePath(p)).filter((p) => Boolean(p));
  const pnpmRoots = [
    // Defaults from pnpm docs
    normalizePath(join4(homeDir, "Library", "pnpm")),
    // macOS
    normalizePath(join4(homeDir, ".local", "share", "pnpm"))
    // Linux
  ].filter((p) => Boolean(p));
  return candidates.some((p) => {
    if (p.includes("/.pnpm/")) return true;
    if (p.includes("/pnpm/")) return true;
    return pnpmRoots.some((root) => p === root || p.startsWith(`${root}/`));
  });
}
function isLikelyYarnGlobalInstall(binaryPath, resolvedBinaryPath, homeDir) {
  const candidates = [binaryPath, resolvedBinaryPath].map((p) => normalizePath(p)).filter((p) => Boolean(p));
  const yarnRoots = [
    normalizePath(join4(homeDir, ".yarn", "bin")),
    // yarn classic global bin
    normalizePath(join4(homeDir, ".config", "yarn", "global"))
    // yarn classic global dir
  ].filter((p) => Boolean(p));
  return candidates.some((p) => {
    if (p.includes("/.yarn/")) return true;
    return yarnRoots.some((root) => p === root || p.startsWith(`${root}/`));
  });
}
function detectInstallMethod(input2) {
  const binaryPath = normalizePath(input2.binaryPath);
  const resolvedBinaryPath = normalizePath(input2.resolvedBinaryPath);
  const npmPrefix = normalizePath(input2.npmPrefix);
  const homeDir = normalizePath(input2.homeDir) ?? input2.homeDir;
  if (resolvedBinaryPath?.includes("/Cellar/counselors/") || resolvedBinaryPath?.includes("/Homebrew/Cellar/counselors/")) {
    return "homebrew";
  }
  if (input2.pnpmPath && isLikelyPnpmInstall(binaryPath, resolvedBinaryPath, homeDir)) {
    return "pnpm";
  }
  if (input2.yarnPath && isLikelyYarnGlobalInstall(binaryPath, resolvedBinaryPath, homeDir)) {
    return "yarn";
  }
  const npmCandidates = npmPrefix ? process.platform === "win32" ? [
    normalizePath(join4(npmPrefix, "counselors.cmd")),
    normalizePath(join4(npmPrefix, "counselors"))
  ] : [normalizePath(join4(npmPrefix, "bin", "counselors"))] : [];
  if (binaryPath && npmCandidates.some((candidate) => candidate === binaryPath)) {
    return "npm";
  }
  if (resolvedBinaryPath?.includes("/node_modules/counselors/")) {
    return "npm";
  }
  if (isSafeStandalonePath(binaryPath, homeDir) || isSafeStandalonePath(resolvedBinaryPath, homeDir)) {
    return "standalone";
  }
  if (input2.brewVersion && !input2.npmVersion) return "homebrew";
  if (input2.npmVersion && !input2.brewVersion) return "npm";
  return "unknown";
}
function detectInstallation(deps = {}) {
  const findBinaryFn = deps.findBinaryFn ?? findBinary;
  const captureCommand = deps.captureCommand ?? defaultCaptureCommand;
  const homeDir = deps.homeDir ?? homedir3();
  const realpathFn = deps.realpathFn ?? realpathSync;
  const binaryPath = findBinaryFn("counselors");
  const resolvedBinaryPath = binaryPath ? safeRealPath(binaryPath, realpathFn) : null;
  const brewPath = findBinaryFn("brew");
  const npmPath = findBinaryFn("npm");
  const pnpmPath = findBinaryFn("pnpm");
  const yarnPath = findBinaryFn("yarn");
  const hasBrew = Boolean(brewPath);
  const hasNpm = Boolean(npmPath);
  const brewVersion = hasBrew ? parseBrewVersion(
    captureCommand(brewPath, ["list", "--versions", "counselors"]).stdout
  ) : null;
  const npmPrefix = hasNpm ? captureCommand(npmPath, ["prefix", "-g"]).stdout.trim() || null : null;
  const npmVersion = hasNpm && npmPrefix ? readNpmGlobalVersion(npmPrefix) : null;
  const npmVersionFallback = hasNpm && npmPath ? readNpmGlobalVersionFromNpmLs(captureCommand, npmPath) : null;
  const effectiveNpmVersion = npmVersion ?? npmVersionFallback;
  const method = detectInstallMethod({
    binaryPath,
    resolvedBinaryPath,
    brewVersion,
    npmVersion: effectiveNpmVersion,
    npmPrefix,
    pnpmPath,
    yarnPath,
    homeDir
  });
  let installedVersion = null;
  if (method === "homebrew") {
    installedVersion = brewVersion;
  } else if (method === "npm") {
    installedVersion = effectiveNpmVersion;
  } else if (method === "standalone" && binaryPath) {
    installedVersion = extractVersion(getBinaryVersion(binaryPath));
  }
  const upgradeCommand = method === "homebrew" ? "brew upgrade counselors" : method === "npm" ? "npm install -g counselors@latest" : method === "pnpm" ? "pnpm add -g counselors@latest" : method === "yarn" ? "yarn global add counselors@latest" : method === "standalone" ? "counselors upgrade" : null;
  return {
    method,
    binaryPath,
    resolvedBinaryPath,
    installedVersion,
    brewVersion,
    npmVersion: effectiveNpmVersion,
    npmPrefix,
    brewPath,
    npmPath,
    pnpmPath,
    yarnPath,
    upgradeCommand
  };
}
async function performUpgrade(detection, opts = {}, deps = {}) {
  const runCommand = deps.runCommand ?? defaultRunCommand;
  if (detection.method === "homebrew") {
    return runManagerUpgrade(
      runCommand,
      "homebrew",
      detection.brewPath ?? "brew",
      ["upgrade", "counselors"]
    );
  }
  if (detection.method === "npm") {
    return runManagerUpgrade(runCommand, "npm", detection.npmPath ?? "npm", [
      "install",
      "-g",
      "counselors@latest"
    ]);
  }
  if (detection.method === "pnpm") {
    return runManagerUpgrade(runCommand, "pnpm", detection.pnpmPath ?? "pnpm", [
      "add",
      "-g",
      "counselors@latest"
    ]);
  }
  if (detection.method === "yarn") {
    return runManagerUpgrade(runCommand, "yarn", detection.yarnPath ?? "yarn", [
      "global",
      "add",
      "counselors@latest"
    ]);
  }
  if (detection.method === "standalone") {
    if (!detection.binaryPath) {
      return {
        ok: false,
        method: detection.method,
        message: "Standalone install detected, but counselors binary path was not found."
      };
    }
    const targetPath = resolveStandaloneTargetPath(detection.binaryPath);
    const homeDir = deps.homeDir ?? homedir3();
    const safe = isSafeStandalonePath(targetPath, homeDir);
    if (!safe && !opts.force) {
      return {
        ok: false,
        method: detection.method,
        message: `Refusing to self-replace counselors outside user-owned install locations.
Detected path: ${targetPath}
Re-run with --force if you are sure this is a standalone install.`
      };
    }
    try {
      const result = await upgradeStandaloneBinary(
        detection.binaryPath,
        detection.installedVersion,
        deps
      );
      return {
        ok: true,
        method: detection.method,
        message: result.didUpgrade ? `Upgraded standalone binary to ${result.version} (${result.assetName}).` : `Already up to date (${result.version}).`
      };
    } catch (e) {
      return {
        ok: false,
        method: detection.method,
        message: e instanceof Error ? e.message : "Standalone upgrade failed for an unknown reason."
      };
    }
  }
  return {
    ok: false,
    method: detection.method,
    message: "Could not detect a supported install method. Supported methods: Homebrew, npm, pnpm, yarn, standalone binary."
  };
}
async function upgradeStandaloneBinary(binaryPath, installedVersion, deps = {}) {
  const fetchFn = deps.fetchFn ?? fetch;
  const assetName = getStandaloneAssetName();
  if (!assetName) {
    throw new Error(
      `Standalone upgrades are only supported on macOS and Linux x64/arm64. Current platform: ${process.platform}/${process.arch}.`
    );
  }
  const checksumAssetName = `${assetName}.sha256`;
  const latestUrl = "https://api.github.com/repos/aarondfrancis/counselors/releases/latest";
  const latestRes = await fetchFn(latestUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "counselors-cli"
    }
  });
  if (!latestRes.ok) {
    throw new Error(
      `Failed to fetch latest release metadata (${latestRes.status} ${latestRes.statusText}).`
    );
  }
  const release = await latestRes.json();
  const tag = release.tag_name;
  if (!tag || typeof tag !== "string") {
    throw new Error("Latest release metadata did not include a valid tag.");
  }
  const latestVersion = stripLeadingV(tag);
  const targetPath = resolveStandaloneTargetPath(binaryPath);
  if (installedVersion && stripLeadingV(installedVersion.trim()) === latestVersion) {
    return {
      version: latestVersion,
      tag,
      assetName,
      targetPath,
      didUpgrade: false
    };
  }
  const checksumAsset = release.assets?.find(
    (a) => a.name === checksumAssetName && typeof a.browser_download_url === "string" && a.browser_download_url.length > 0
  ) ?? null;
  const checksumUrl = checksumAsset?.browser_download_url ?? `https://github.com/aarondfrancis/counselors/releases/download/${tag}/${checksumAssetName}`;
  const asset = release.assets?.find(
    (a) => a.name === assetName && typeof a.browser_download_url === "string" && a.browser_download_url.length > 0
  ) ?? null;
  const downloadUrl = asset?.browser_download_url ?? `https://github.com/aarondfrancis/counselors/releases/download/${tag}/${assetName}`;
  const checksumRes = await fetchFn(checksumUrl, {
    headers: { "User-Agent": "counselors-cli" }
  });
  if (!checksumRes.ok) {
    throw new Error(
      `Failed to download checksum ${checksumAssetName} (${checksumRes.status} ${checksumRes.statusText}).`
    );
  }
  const checksumText = await checksumRes.text();
  const expectedHash = parseSha256File(checksumText, assetName);
  if (!expectedHash) {
    throw new Error(`Could not parse SHA256 from ${checksumAssetName}.`);
  }
  const binaryRes = await fetchFn(downloadUrl, {
    headers: { "User-Agent": "counselors-cli" }
  });
  if (!binaryRes.ok) {
    throw new Error(
      `Failed to download ${assetName} (${binaryRes.status} ${binaryRes.statusText}).`
    );
  }
  const bytes = Buffer.from(await binaryRes.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error("Downloaded binary was empty.");
  }
  const tempPath = `${targetPath}.tmp-${Date.now()}`;
  const backupPath = uniqueBackupPath(targetPath);
  const actualHash = sha256(bytes);
  if (!hashesEqual(actualHash, expectedHash)) {
    throw new Error(
      `Checksum mismatch for ${assetName}.
Expected: ${expectedHash}
Actual:   ${actualHash}`
    );
  }
  try {
    ensureWritable(dirname2(targetPath));
    writeFileSync2(tempPath, bytes, { mode: 493 });
    chmodSync(tempPath, 493);
    renameSync2(targetPath, backupPath);
    try {
      renameSync2(tempPath, targetPath);
      chmodSync(targetPath, 493);
      validateExecutable(targetPath);
      rmSync2(backupPath, { force: true });
    } catch (e) {
      try {
        if (existsSync5(targetPath)) rmSync2(targetPath, { force: true });
      } catch {
      }
      try {
        if (existsSync5(backupPath)) renameSync2(backupPath, targetPath);
      } catch {
      }
      throw e;
    }
  } finally {
    if (existsSync5(tempPath)) {
      unlinkSync2(tempPath);
    }
  }
  return {
    version: latestVersion,
    tag,
    assetName,
    targetPath,
    didUpgrade: true
  };
}
function runManagerUpgrade(runCommand, method, cmd, args) {
  const result = runCommand(cmd, args);
  if (result.ok) {
    return {
      ok: true,
      method,
      message: `Upgrade command completed: ${cmd} ${args.join(" ")}`
    };
  }
  return {
    ok: false,
    method,
    message: `Upgrade command failed: ${cmd} ${args.join(" ")}${result.errorMessage ? ` (${result.errorMessage})` : ""}`
  };
}
function resolveStandaloneTargetPath(binaryPath) {
  try {
    const stat = lstatSync2(binaryPath);
    if (stat.isSymbolicLink()) {
      return realpathSync(binaryPath);
    }
  } catch {
  }
  return binaryPath;
}
function extractVersion(value) {
  if (!value) return null;
  const semverMatch = value.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/);
  if (semverMatch) return semverMatch[0];
  const firstToken = value.trim().split(/\s+/)[0];
  return firstToken || null;
}
function stripLeadingV(version) {
  return version.startsWith("v") ? version.slice(1) : version;
}
function safeRealPath(path, realpathFn) {
  try {
    return realpathFn(path);
  } catch {
    return path;
  }
}
function normalizePath(path) {
  if (!path) return null;
  return resolve3(path).replace(/\\/g, "/");
}
function defaultCaptureCommand(cmd, args) {
  try {
    const stdout = execFileSync2(cmd, args, {
      timeout: VERSION_TIMEOUT,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8"
    }).trim();
    return {
      ok: true,
      stdout,
      stderr: "",
      exitCode: 0
    };
  } catch (error2) {
    const stdout = toText(error2.stdout).trim();
    const stderr = toText(error2.stderr).trim();
    const exitCode = typeof error2.status === "number" ? error2.status ?? 1 : 1;
    return {
      ok: false,
      stdout,
      stderr,
      exitCode
    };
  }
}
function defaultRunCommand(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit"
  });
  if (result.error) {
    return {
      ok: false,
      exitCode: 1,
      errorMessage: result.error.message
    };
  }
  const exitCode = result.status ?? 1;
  return {
    ok: exitCode === 0,
    exitCode
  };
}
function readNpmGlobalVersion(npmPrefix) {
  const packageJsonPaths = process.platform === "win32" ? [join4(npmPrefix, "node_modules", "counselors", "package.json")] : [
    join4(npmPrefix, "lib", "node_modules", "counselors", "package.json"),
    join4(npmPrefix, "node_modules", "counselors", "package.json")
  ];
  for (const packageJsonPath of packageJsonPaths) {
    if (!existsSync5(packageJsonPath)) continue;
    try {
      const raw = readFileSync4(packageJsonPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (typeof parsed.version === "string") {
        return parsed.version;
      }
    } catch {
    }
  }
  return null;
}
function readNpmGlobalVersionFromNpmLs(captureCommand, npmPath) {
  const result = captureCommand(npmPath, [
    "ls",
    "-g",
    "counselors",
    "--depth=0",
    "--json"
  ]);
  if (!result.ok) return null;
  return parseNpmLsVersion(result.stdout);
}
function parseSha256File(text, filename) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    let match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (match) {
      const hash = match[1].toLowerCase();
      const file = match[2].trim();
      if (file === filename || file.endsWith(`/${filename}`)) return hash;
      continue;
    }
    match = line.match(/^SHA256\((.+)\)=\s*([a-fA-F0-9]{64})$/);
    if (match) {
      const file = match[1].trim();
      const hash = match[2].toLowerCase();
      if (file === filename || file.endsWith(`/${filename}`)) return hash;
      continue;
    }
    if (/^[a-fA-F0-9]{64}$/.test(line)) return line.toLowerCase();
  }
  return null;
}
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function hashesEqual(a, b) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
function uniqueBackupPath(targetPath) {
  const base = `${targetPath}.bak`;
  if (!existsSync5(base)) return base;
  return `${base}.${Date.now()}`;
}
function ensureWritable(dir) {
  try {
    accessSync2(dir, constants2.W_OK);
  } catch {
    throw new Error(
      `No write permission to upgrade counselors in: ${dir}
Try reinstalling in ~/.local/bin or use your package manager to upgrade.`
    );
  }
}
function validateExecutable(path) {
  try {
    execFileSync2(path, ["--version"], {
      timeout: VERSION_TIMEOUT,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8"
    });
  } catch (e) {
    throw new Error(
      `Post-upgrade validation failed for ${path}: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
function toText(value) {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf-8");
  return "";
}

// src/ui/output.ts
import { isAbsolute } from "path";
import ora from "ora";
function clickablePath(p) {
  return !isAbsolute(p) && !p.startsWith(".") ? `./${p}` : p;
}
function createSpinner(text) {
  return ora({ text, stream: process.stderr });
}
function formatDiscoveryResults(results) {
  const lines = ["", "Discovered tools:", ""];
  for (const r of results) {
    const name = r.displayName || r.toolId;
    if (r.found) {
      lines.push(`  \u2713 ${name}`);
      lines.push(`    Path: ${r.path}`);
      if (r.version) lines.push(`    Version: ${r.version}`);
    } else {
      lines.push(`  \u2717 ${name} \u2014 not found`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
function formatDoctorResults(checks) {
  const lines = ["", "Doctor results:", ""];
  for (const c of checks) {
    const icon = c.status === "pass" ? "\u2713" : c.status === "warn" ? "\u26A0" : "\u2717";
    lines.push(`  ${icon} ${c.name}: ${c.message}`);
  }
  const failures = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warn").length;
  lines.push("");
  if (failures > 0) {
    lines.push(`${failures} check(s) failed.`);
  } else if (warnings > 0) {
    lines.push(`All checks passed with ${warnings} warning(s).`);
  } else {
    lines.push("All checks passed.");
  }
  lines.push("");
  return lines.join("\n");
}
function formatToolList(tools2, verbose) {
  if (tools2.length === 0) {
    return '\nNo tools configured. Run "counselors init" to get started.\n';
  }
  const lines = ["", "Configured tools:", ""];
  for (const t of tools2) {
    if (!verbose) {
      lines.push(`  \x1B[1m${t.id}\x1B[0m (${t.binary})`);
      continue;
    }
    const bold = "\x1B[1m";
    const reset = "\x1B[0m";
    lines.push(`  ${bold}${t.id}${reset}`);
    const raw = t.args ?? [];
    const quote = (a) => a.includes(" ") ? `"${a}"` : a;
    const allParts = [t.binary, ...raw].map(quote);
    let line = "    ";
    for (const part of allParts) {
      if (part.startsWith("-") && line.trim().length > 0) {
        lines.push(line);
        line = `    ${part}`;
      } else {
        line += (line.trim().length > 0 ? " " : "") + part;
      }
    }
    if (line.trim().length > 0) lines.push(line);
  }
  if (!verbose) {
    const dim = "\x1B[2m";
    const reset = "\x1B[0m";
    lines.push("");
    lines.push(`${dim}(Use -v to show flags)${reset}`);
  }
  lines.push("");
  return lines.join("\n");
}
function formatTestResults(results) {
  const lines = ["", "Test results:", ""];
  for (const r of results) {
    const icon = r.passed ? "\u2713" : "\u2717";
    lines.push(`  ${icon} ${r.toolId} (${r.durationMs}ms)`);
    if (r.command) {
      lines.push(`    $ ${r.command}`);
    }
    if (!r.passed && r.error) {
      lines.push(`    Error: ${r.error}`);
    }
    if (!r.passed && r.output) {
      lines.push(`    Output: ${r.output.slice(0, 200).replace(/\n/g, "\\n")}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
function formatRunSummary(manifest) {
  if (manifest.rounds && manifest.rounds.length > 0) {
    return formatMultiRoundSummary(manifest);
  }
  const lines = ["", `Run complete: ${manifest.slug}`, ""];
  for (const r of manifest.tools) {
    const icon = r.status === "success" ? "\u2713" : r.status === "timeout" ? "\u23F1" : "\u2717";
    const duration = (r.durationMs / 1e3).toFixed(1);
    lines.push(`  ${icon} ${r.toolId} \u2014 ${r.wordCount} words, ${duration}s`);
    if (r.cost) {
      lines.push(`    Cost: $${r.cost.cost_usd.toFixed(2)} (${r.cost.source})`);
    }
    if (r.status === "error" && r.error) {
      lines.push(`    Error: ${r.error}`);
    }
  }
  lines.push("");
  lines.push(
    `Reports saved to: ${manifest.tools[0]?.outputFile ? clickablePath(manifest.tools[0].outputFile.replace(/\/[^/]+$/, "/")) : "output dir"}`
  );
  lines.push("");
  return lines.join("\n");
}
function formatMultiRoundSummary(manifest) {
  const lines = [
    "",
    `Run complete: ${manifest.slug}`,
    `  ${manifest.totalRounds} round(s)${manifest.durationMs ? ` in ${(manifest.durationMs / 1e3).toFixed(1)}s` : ""}${manifest.preset ? ` (preset: ${manifest.preset})` : ""}`,
    ""
  ];
  for (const round of manifest.rounds) {
    lines.push(`  Round ${round.round}:`);
    for (const r of round.tools) {
      const icon = r.status === "success" ? "\u2713" : r.status === "timeout" ? "\u23F1" : "\u2717";
      const duration = (r.durationMs / 1e3).toFixed(1);
      lines.push(
        `    ${icon} ${r.toolId} \u2014 ${r.wordCount} words, ${duration}s`
      );
    }
  }
  lines.push("");
  lines.push(
    `Reports saved to: ${manifest.tools[0]?.outputFile ? clickablePath(manifest.tools[0].outputFile.replace(/\/[^/]+\/[^/]+$/, "/")) : "output dir"}`
  );
  lines.push("");
  return lines.join("\n");
}
function formatDryRun(invocations) {
  const lines = ["", "Dry run \u2014 would dispatch:", ""];
  for (const inv of invocations) {
    lines.push(`  ${inv.toolId}`);
    lines.push(`    $ ${inv.cmd} ${inv.args.join(" ")}`);
  }
  lines.push("");
  return lines.join("\n");
}

// src/commands/doctor.ts
function registerDoctorCommand(program2) {
  program2.command("doctor").description("Check tool configuration and health").action(async () => {
    const checks = [];
    if (existsSync6(CONFIG_FILE)) {
      checks.push({
        name: "Config file",
        status: "pass",
        message: CONFIG_FILE
      });
    } else {
      checks.push({
        name: "Config file",
        status: "warn",
        message: 'Not found. Run "counselors init" to create one.'
      });
    }
    let config;
    try {
      config = loadConfig();
    } catch (e) {
      checks.push({
        name: "Config parse",
        status: "fail",
        message: `Invalid config: ${e}`
      });
      info(formatDoctorResults(checks));
      process.exitCode = 1;
      return;
    }
    const toolIds = Object.keys(config.tools);
    if (toolIds.length === 0) {
      checks.push({
        name: "Tools configured",
        status: "warn",
        message: 'No tools configured. Run "counselors init".'
      });
    }
    for (const id of toolIds) {
      const toolConfig = config.tools[id];
      const binaryPath = findBinary(toolConfig.binary);
      if (binaryPath) {
        checks.push({
          name: `${id}: binary`,
          status: "pass",
          message: binaryPath
        });
      } else {
        checks.push({
          name: `${id}: binary`,
          status: "fail",
          message: `"${toolConfig.binary}" not found in PATH`
        });
        continue;
      }
      const version = getBinaryVersion(binaryPath);
      if (version) {
        checks.push({
          name: `${id}: version`,
          status: "pass",
          message: version
        });
      } else {
        checks.push({
          name: `${id}: version`,
          status: "warn",
          message: "Could not determine version"
        });
      }
      const adapter = resolveAdapter(id, toolConfig);
      let readOnlyLevel = adapter.readOnly.level;
      const adapterName = toolConfig.adapter ?? id;
      if (adapterName === "amp" && isAmpDeepMode(toolConfig.extraFlags)) {
        readOnlyLevel = "bestEffort";
      }
      checks.push({
        name: `${id}: read-only`,
        status: readOnlyLevel === "none" ? "warn" : "pass",
        message: readOnlyLevel
      });
    }
    const hasAmp = Object.entries(config.tools).some(
      ([id, t]) => (t.adapter ?? id) === "amp"
    );
    if (hasAmp) {
      if (existsSync6(AMP_SETTINGS_FILE)) {
        checks.push({
          name: "Amp settings file",
          status: "pass",
          message: AMP_SETTINGS_FILE
        });
      } else {
        checks.push({
          name: "Amp settings file",
          status: "warn",
          message: "Not found. Amp read-only mode may not work."
        });
      }
      if (existsSync6(AMP_DEEP_SETTINGS_FILE)) {
        checks.push({
          name: "Amp deep settings file",
          status: "pass",
          message: AMP_DEEP_SETTINGS_FILE
        });
      } else {
        checks.push({
          name: "Amp deep settings file",
          status: "warn",
          message: "Not found. Amp deep mode may not work."
        });
      }
    }
    const groups2 = config.groups ?? {};
    for (const [groupName, members] of Object.entries(groups2)) {
      const invalid = members.filter((m) => !config.tools[m]);
      if (invalid.length > 0) {
        checks.push({
          name: `group "${groupName}"`,
          status: "fail",
          message: `References missing tool(s): ${invalid.join(", ")}`
        });
      } else {
        checks.push({
          name: `group "${groupName}"`,
          status: "pass",
          message: `${members.length} tool(s)`
        });
      }
    }
    const detection = detectInstallation();
    const sources = [];
    if (detection.brewVersion) sources.push("homebrew");
    if (detection.npmVersion) sources.push("npm");
    const home = process.env.HOME ?? "";
    const standalonePaths = [
      join5(home, ".local", "bin", "counselors"),
      join5(home, "bin", "counselors")
    ];
    const hasStandalone = home && standalonePaths.some((p) => existsSync6(p));
    if (hasStandalone) sources.push("standalone");
    if (sources.length > 1) {
      checks.push({
        name: "Multiple installations",
        status: "warn",
        message: `Found counselors via ${sources.join(", ")}. This may cause version conflicts.`
      });
    }
    info(formatDoctorResults(checks));
    if (checks.some((c) => c.status === "fail")) {
      process.exitCode = 1;
    }
  });
}

// src/commands/groups/add.ts
function parseToolList(value) {
  if (!value) return [];
  return value.split(",").map((t) => t.trim()).filter(Boolean);
}
function registerGroupAddCommand(program2) {
  program2.command("add <name>").description("Create or update a group (comma-separated tool IDs)").requiredOption("-t, --tools <list>", "Comma-separated tool IDs").action(async (name, opts) => {
    if (!SAFE_ID_RE.test(name)) {
      error(
        `Invalid group name "${name}". Use only letters, numbers, dots, hyphens, and underscores.`
      );
      process.exitCode = 1;
      return;
    }
    const toolIds = parseToolList(opts.tools);
    if (toolIds.length === 0) {
      error("No tool IDs provided. Use --tools <a,b,c>.");
      process.exitCode = 1;
      return;
    }
    const config = loadConfig();
    if (Object.keys(config.tools).length === 0) {
      error('No tools configured. Run "counselors init" first.');
      process.exitCode = 1;
      return;
    }
    for (const id of toolIds) {
      if (!config.tools[id]) {
        error(`Tool "${id}" is not configured.`);
        process.exitCode = 1;
        return;
      }
    }
    const existed = Boolean(config.groups[name]);
    const updated = addGroupToConfig(config, name, toolIds);
    saveConfig(updated);
    success(
      existed ? `Updated group "${name}" (${toolIds.length} tool(s)).` : `Created group "${name}" (${toolIds.length} tool(s)).`
    );
  });
}

// src/commands/groups/list.ts
function formatGroupList(groups2) {
  const names = Object.keys(groups2).sort();
  if (names.length === 0) {
    return '\nNo groups configured. Use "counselors groups add <name> --tools <list>" to create one.\n';
  }
  const lines = ["", "Configured groups:", ""];
  for (const name of names) {
    const toolIds = groups2[name] ?? [];
    lines.push(
      `  ${name}: ${toolIds.length > 0 ? toolIds.join(", ") : "(empty)"}`
    );
  }
  lines.push("");
  return lines.join("\n");
}
function registerGroupListCommand(program2) {
  program2.command("list").alias("ls").description("List configured groups").action(async () => {
    const config = loadConfig();
    info(formatGroupList(config.groups));
  });
}

// src/commands/groups/remove.ts
function registerGroupRemoveCommand(program2) {
  program2.command("remove <name>").description("Remove a configured group").action(async (name) => {
    const config = loadConfig();
    if (!config.groups[name]) {
      error(`Group "${name}" is not configured.`);
      process.exitCode = 1;
      return;
    }
    const updated = removeGroupFromConfig(config, name);
    saveConfig(updated);
    success(`Removed group "${name}".`);
  });
}

// src/core/amp-utils.ts
import { mkdirSync as mkdirSync2, writeFileSync as writeFileSync3 } from "fs";

// assets/amp-deep-settings.json
var amp_deep_settings_default = {
  "amp.tools.enable": [
    "Read",
    "Grep",
    "glob",
    "finder",
    "librarian",
    "look_at",
    "oracle",
    "read_web_page",
    "read_mcp_resource",
    "read_thread",
    "find_thread",
    "web_search",
    "Bash"
  ]
};

// assets/amp-readonly-settings.json
var amp_readonly_settings_default = {
  "amp.tools.enable": [
    "Read",
    "Grep",
    "glob",
    "finder",
    "librarian",
    "look_at",
    "oracle",
    "read_web_page",
    "read_mcp_resource",
    "read_thread",
    "find_thread",
    "web_search"
  ]
};

// src/core/amp-utils.ts
function copyAmpSettings() {
  mkdirSync2(CONFIG_DIR, { recursive: true });
  writeFileSync3(
    AMP_SETTINGS_FILE,
    `${JSON.stringify(amp_readonly_settings_default, null, 2)}
`,
    { mode: CONFIG_FILE_MODE }
  );
  writeFileSync3(
    AMP_DEEP_SETTINGS_FILE,
    `${JSON.stringify(amp_deep_settings_default, null, 2)}
`,
    { mode: CONFIG_FILE_MODE }
  );
}

// src/core/executor.ts
import { execFileSync as execFileSync3 } from "child_process";
import { delimiter as delimiter2, dirname as dirname3, isAbsolute as isAbsolute2, normalize, parse } from "path";
import crossSpawn2 from "cross-spawn";
import stripAnsi from "strip-ansi";
var MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
var WINDOWS_TASKKILL_TIMEOUT_MS = 1500;
var activeChildren = /* @__PURE__ */ new Set();
function killProcessGroup(child, signal) {
  if (process.platform === "win32") {
    try {
      if (child.pid) {
        const taskkillArgs = ["/PID", String(child.pid), "/T"];
        if (signal === "SIGKILL") {
          taskkillArgs.push("/F");
        }
        execFileSync3("taskkill", taskkillArgs, {
          stdio: "ignore",
          windowsHide: true,
          timeout: WINDOWS_TASKKILL_TIMEOUT_MS
        });
        return;
      }
    } catch {
    }
  }
  try {
    if (child.pid) {
      process.kill(-child.pid, signal);
      return;
    }
  } catch {
  }
  try {
    child.kill(signal);
  } catch {
  }
}
var sigintExitTimer = null;
process.on("SIGINT", () => {
  for (const child of activeChildren) {
    killProcessGroup(child, "SIGTERM");
  }
  sigintExitTimer = setTimeout(() => process.exit(1), 2e3);
});
function clearSigintExit() {
  if (sigintExitTimer) {
    clearTimeout(sigintExitTimer);
    sigintExitTimer = null;
  }
}
var ENV_DENYLIST = /* @__PURE__ */ new Set([
  "NODE_OPTIONS",
  "NODE_EXTRA_CA_CERTS",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "LD_AUDIT",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "DYLD_FRAMEWORK_PATH",
  "ELECTRON_RUN_AS_NODE"
]);
var ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "USER",
  "TERM",
  "LANG",
  "SHELL",
  "TMPDIR",
  "TEMP",
  "TMP",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  // Windows system environment (needed for .cmd resolution and child tools)
  "PATHEXT",
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  // Node version managers
  "NVM_BIN",
  "NVM_DIR",
  "FNM_MULTISHELL_PATH",
  // API keys for adapters
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_ORG_ID",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_CLOUD_LOCATION",
  "AMP_API_KEY",
  "OPENROUTER_API_KEY",
  // Proxy
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy"
  // NOTE: NODE_OPTIONS intentionally excluded — it allows injecting
  // --require flags that execute arbitrary code in child processes.
];
function buildSafeEnv(extra) {
  const env = {};
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key]) env[key] = process.env[key];
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (!ENV_DENYLIST.has(key)) env[key] = value;
    }
  }
  env.CI = "true";
  env.NO_COLOR = "1";
  return env;
}
function normalizeWindowsPathForComparison(path) {
  const trimmed = path.trim().replace(/^"(.*)"$/, "$1");
  const normalized = normalize(trimmed);
  const root = parse(normalized).root;
  const withoutTrailing = normalized === root ? normalized : normalized.replace(/[\\/]+$/, "");
  return withoutTrailing.toLowerCase();
}
function execute(invocation, timeoutMs, onSpawn) {
  return new Promise((resolve12) => {
    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let processExited = false;
    let killTimer;
    let truncated = false;
    debug(`Executing: ${invocation.cmd} ${invocation.args.join(" ")}`);
    const env = buildSafeEnv(invocation.env);
    if (process.platform === "win32" && isAbsolute2(invocation.cmd)) {
      const binDir = dirname3(invocation.cmd);
      const currentPath = env.PATH ?? env.Path ?? "";
      const parts = currentPath.split(delimiter2).map((p) => p.trim()).filter(Boolean);
      const normalizedBinDir = normalizeWindowsPathForComparison(binDir);
      const hasBinDir = parts.some(
        (p) => normalizeWindowsPathForComparison(p) === normalizedBinDir
      );
      if (!hasBinDir) {
        const nextPath = currentPath ? `${binDir}${delimiter2}${currentPath}` : binDir;
        env.PATH = nextPath;
        if (env.Path != null) env.Path = nextPath;
      }
    }
    const child = crossSpawn2(invocation.cmd, invocation.args, {
      cwd: invocation.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      // On POSIX, detached creates a new process group so we can kill the
      // entire tree with process.kill(-pid).  On Windows this breaks stdout
      // capture for .cmd/.bat wrappers (cross-spawn routes them through
      // cmd.exe /c and the new console swallows the pipes).  Windows process
      // tree killing is handled via taskkill /T instead.
      detached: process.platform !== "win32",
      shell: false,
      windowsHide: true
    });
    activeChildren.add(child);
    onSpawn?.(child.pid);
    const stdoutStream = child.stdout;
    const stderrStream = child.stderr;
    const stdinStream = child.stdin;
    if (!stdoutStream || !stderrStream || !stdinStream) {
      killProcessGroup(child, "SIGKILL");
      activeChildren.delete(child);
      resolve12({
        exitCode: 1,
        stdout: "",
        stderr: "Failed to initialize child process stdio streams.",
        timedOut: false,
        durationMs: Date.now() - start
      });
      return;
    }
    stdoutStream.on("data", (data) => {
      if (!truncated && stdout.length < MAX_OUTPUT_BYTES) {
        stdout += data.toString();
        if (stdout.length >= MAX_OUTPUT_BYTES) {
          truncated = true;
          stdout = `${stdout.slice(0, MAX_OUTPUT_BYTES)}
[output truncated at 10MB]`;
        }
      }
    });
    stderrStream.on("data", (data) => {
      if (stderr.length < MAX_OUTPUT_BYTES) {
        stderr += data.toString();
      }
    });
    if (invocation.stdin) {
      stdinStream.write(invocation.stdin);
      stdinStream.end();
    } else {
      stdinStream.end();
    }
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child, "SIGTERM");
      killTimer = setTimeout(() => {
        if (!processExited) {
          killProcessGroup(child, "SIGKILL");
        }
      }, KILL_GRACE_PERIOD);
    }, timeoutMs);
    child.on("close", (code) => {
      processExited = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      activeChildren.delete(child);
      resolve12({
        exitCode: code ?? 1,
        stdout: stripAnsi(stdout),
        stderr: stripAnsi(stderr),
        timedOut,
        durationMs: Date.now() - start
      });
    });
    child.on("error", (err) => {
      processExited = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      activeChildren.delete(child);
      resolve12({
        exitCode: 1,
        stdout: "",
        stderr: err.message,
        timedOut: false,
        durationMs: Date.now() - start
      });
    });
  });
}
async function captureAmpUsage() {
  const result = await execute(
    {
      cmd: "amp",
      args: ["usage"],
      cwd: process.cwd()
    },
    1e4
  );
  return result.exitCode === 0 ? result.stdout : null;
}
function computeAmpCostFromSnapshots(before, after) {
  try {
    const beforeParsed = parseAmpUsage(before);
    const afterParsed = parseAmpUsage(after);
    return computeAmpCost(beforeParsed, afterParsed);
  } catch {
    return null;
  }
}
async function executeTest(adapter, toolConfig, toolName) {
  const prompt = "Reply with exactly: OK";
  const start = Date.now();
  const invocation = adapter.buildInvocation({
    prompt,
    promptFilePath: "",
    toolId: adapter.id,
    outputDir: "",
    readOnlyPolicy: "none",
    timeout: TEST_TIMEOUT / 1e3,
    cwd: process.cwd(),
    binary: toolConfig.binary,
    extraFlags: toolConfig.extraFlags
  });
  if (invocation.stdin != null) {
    invocation.stdin = prompt;
    invocation.args = invocation.args.filter((a, i, arr) => {
      if (a === "--settings-file") return false;
      if (i > 0 && arr[i - 1] === "--settings-file") return false;
      return true;
    });
  } else {
    const lastArgIdx = invocation.args.length - 1;
    invocation.args[lastArgIdx] = prompt;
  }
  const quote = (s) => /[^a-zA-Z0-9_./:=@-]/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s;
  const cmdStr = [invocation.cmd, ...invocation.args].map(quote).join(" ");
  const command = invocation.stdin != null ? `echo ${quote(invocation.stdin)} | ${cmdStr}` : cmdStr;
  const result = await execute(invocation, TEST_TIMEOUT);
  const echoedPrompt = result.stdout.includes("User instructions");
  const passed = result.exitCode === 0 && result.stdout.includes("OK") && !echoedPrompt;
  let error2;
  if (!passed) {
    if (result.timedOut) {
      error2 = `Timed out after ${TEST_TIMEOUT / 1e3}s`;
    } else if (result.exitCode !== 0) {
      error2 = result.stderr.trim() || `Process exited with code ${result.exitCode}`;
    } else if (echoedPrompt) {
      error2 = "Tool echoed the prompt instead of a model response (check model access)";
    } else if (result.stderr.trim()) {
      error2 = result.stderr.slice(0, 500);
    } else {
      error2 = 'Output did not contain "OK"';
    }
  }
  return {
    toolId: toolName ?? adapter.id,
    passed,
    output: result.stdout.slice(0, 500),
    error: error2,
    durationMs: Date.now() - start,
    command
  };
}

// src/commands/init.ts
function buildToolConfig(id, adapter, binaryPath) {
  return {
    binary: binaryPath,
    readOnly: { level: adapter.readOnly.level },
    ...id === "gemini" || id === "codex" ? { timeout: 900 } : {}
  };
}
function compoundId(adapterId, modelId) {
  if (modelId.startsWith(`${adapterId}-`)) return modelId;
  return `${adapterId}-${modelId}`;
}
function registerInitCommand(program2) {
  program2.command("init").description("Interactive setup wizard").option(
    "--auto",
    "Non-interactive mode: discover tools, use recommended models, output JSON"
  ).action(async (opts) => {
    if (opts.auto) {
      const adapters2 = getAllBuiltInAdapters();
      const discoveries2 = adapters2.map((adapter) => {
        const result = discoverTool(adapter.commands);
        return { adapter, discovery: result };
      });
      const foundTools2 = discoveries2.filter((d) => d.discovery.found);
      if (foundTools2.length === 0) {
        info(
          JSON.stringify(
            {
              configured: [],
              notFound: adapters2.map((a) => a.id),
              configPath: CONFIG_DIR
            },
            null,
            2
          )
        );
        return;
      }
      let config2 = loadConfig();
      const configured = [];
      const notFound = [];
      for (const { adapter, discovery } of discoveries2) {
        if (!discovery.found) {
          notFound.push(adapter.id);
          continue;
        }
        for (const model of adapter.models) {
          const cid = model.compoundId ?? compoundId(adapter.id, model.id);
          const toolConfig = {
            ...buildToolConfig(adapter.id, adapter, discovery.path),
            adapter: adapter.id,
            ...model.extraFlags ? { extraFlags: model.extraFlags } : {}
          };
          config2 = addToolToConfig(config2, cid, toolConfig);
          configured.push({
            id: cid,
            adapter: adapter.id,
            binary: discovery.path,
            version: discovery.version
          });
        }
      }
      if (configured.some((t) => t.adapter === "amp")) {
        copyAmpSettings();
      }
      saveConfig(config2);
      info(
        JSON.stringify(
          { configured, notFound, configPath: CONFIG_DIR },
          null,
          2
        )
      );
      return;
    }
    info("\nCounselors \u2014 setup wizard\n");
    const existingConfig = loadConfig();
    const existingTools = Object.keys(existingConfig.tools);
    if (existingTools.length > 0) {
      warn(
        `Existing config has ${existingTools.length} tool(s). Re-running init will overwrite any tools with the same name.`
      );
    }
    const spinner = createSpinner("Discovering installed tools...").start();
    const adapters = getAllBuiltInAdapters();
    const discoveries = adapters.map((adapter) => {
      const result = discoverTool(adapter.commands);
      return { adapter, discovery: result };
    });
    spinner.stop();
    info(
      formatDiscoveryResults(
        discoveries.map((d) => ({
          ...d.discovery,
          toolId: d.adapter.id,
          displayName: d.adapter.displayName
        }))
      )
    );
    const foundTools = discoveries.filter((d) => d.discovery.found);
    if (foundTools.length === 0) {
      warn(
        "No AI CLI tools found. Install at least one before running init."
      );
      return;
    }
    const selectedIds = await selectTools(
      discoveries.map((d) => ({
        id: d.adapter.id,
        name: d.adapter.displayName,
        found: d.discovery.found
      }))
    );
    if (selectedIds.length === 0) {
      info("No tools selected. Exiting.");
      return;
    }
    let config = loadConfig();
    const configuredIds = [];
    for (const id of selectedIds) {
      const d = discoveries.find((x) => x.adapter.id === id);
      const models = await selectModels(id, d.adapter.models);
      for (const model of models) {
        const cid = model.compoundId ?? compoundId(id, model.id);
        const toolConfig = {
          ...buildToolConfig(id, d.adapter, d.discovery.path),
          adapter: id,
          ...model.extraFlags ? { extraFlags: model.extraFlags } : {}
        };
        config = addToolToConfig(config, cid, toolConfig);
        configuredIds.push(cid);
      }
    }
    if (selectedIds.includes("amp")) {
      copyAmpSettings();
      success(`Copied amp settings to ${AMP_SETTINGS_FILE}`);
    }
    saveConfig(config);
    success(`Config saved to ${CONFIG_DIR}`);
    const runTests = await confirmAction("Run tool tests now?");
    if (runTests) {
      const testResults = [];
      for (const id of configuredIds) {
        const toolConfig = config.tools[id];
        const adapter = resolveAdapter(id, toolConfig);
        const spinner2 = createSpinner(`Testing ${id}...`).start();
        const result = await executeTest(adapter, toolConfig, id);
        spinner2.stop();
        testResults.push(result);
      }
      info(formatTestResults(testResults));
    }
  });
}

// src/commands/loop.ts
import { join as join13, resolve as resolve9 } from "path";

// src/core/boilerplate.ts
function getExecutionBoilerplate() {
  return `## General Guidelines

- Focus on source directories, not vendor/node_modules/generated/dependency dirs
- Skip binary files, lockfiles, bundled output, compiled assets
- Provide thorough analysis with clear headings
- Include file paths and function names for each finding
- Focus on actionable findings, not trivial style issues`;
}

// src/core/loop.ts
import { mkdirSync as mkdirSync3, readdirSync as readdirSync3 } from "fs";
import { join as join8, resolve as resolve4 } from "path";

// src/core/dispatcher.ts
import { join as join6 } from "path";
import pLimit from "p-limit";
async function dispatch(options) {
  const {
    config,
    toolIds,
    promptFilePath,
    promptContent,
    outputDir,
    readOnlyPolicy,
    cwd,
    onProgress
  } = options;
  const limit = pLimit(config.defaults.maxParallel);
  const eligibleTools = toolIds.filter((id) => {
    const toolConfig = config.tools[id];
    if (!toolConfig) {
      warn(`Tool "${id}" not configured, skipping.`);
      return false;
    }
    if (readOnlyPolicy === "enforced") {
      const adapter = resolveAdapter(id, toolConfig);
      const effectiveLevel = adapter.getEffectiveReadOnlyLevel ? adapter.getEffectiveReadOnlyLevel(toolConfig) : adapter.readOnly.level;
      if (effectiveLevel !== "enforced") {
        warn(
          `Skipping "${id}" \u2014 read-only level is "${effectiveLevel}", policy requires "enforced".`
        );
        return false;
      }
    }
    return true;
  });
  if (eligibleTools.length === 0) {
    throw new Error("No eligible tools after read-only policy filtering.");
  }
  const tasks = eligibleTools.map(
    (id) => limit(async () => {
      const toolConfig = config.tools[id];
      const adapter = resolveAdapter(id, toolConfig);
      const toolTimeout = toolConfig.timeout ?? config.defaults.timeout;
      const toolTimeoutMs = toolTimeout * 1e3;
      const req = {
        prompt: promptContent,
        promptFilePath,
        toolId: id,
        outputDir,
        readOnlyPolicy,
        timeout: toolTimeout,
        cwd,
        binary: toolConfig.binary,
        extraFlags: toolConfig.extraFlags
      };
      const invocation = adapter.buildInvocation(req);
      const isAmp = (toolConfig.adapter ?? id) === "amp";
      const usageBefore = isAmp ? await captureAmpUsage() : null;
      debug(`Dispatching ${id}`);
      const result = await execute(invocation, toolTimeoutMs, (pid) => {
        onProgress?.({ toolId: id, event: "started", pid });
      });
      const usageAfter = isAmp ? await captureAmpUsage() : null;
      const cost = isAmp && usageBefore && usageAfter ? computeAmpCostFromSnapshots(usageBefore, usageAfter) : void 0;
      const safeId = sanitizeId(id);
      const outputFile = join6(outputDir, `${safeId}.md`);
      const stderrFile = join6(outputDir, `${safeId}.stderr`);
      safeWriteFile(outputFile, result.stdout);
      safeWriteFile(stderrFile, result.stderr);
      if (cost) {
        const statsFile = join6(outputDir, `${safeId}.stats.json`);
        safeWriteFile(statsFile, JSON.stringify({ cost }, null, 2));
      }
      const parsed = adapter.parseResult?.(result) ?? {};
      const report = {
        toolId: id,
        // Defaults (overridden by adapter's parseResult)
        status: "error",
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        wordCount: 0,
        // Adapter-authoritative fields
        ...parsed,
        // Dispatcher-only fields (never overridden by adapter)
        outputFile,
        stderrFile,
        cost: cost ?? void 0,
        error: result.exitCode !== 0 ? result.stderr.slice(0, 500) : void 0
      };
      onProgress?.({ toolId: id, event: "completed", report });
      return report;
    })
  );
  const results = await Promise.allSettled(tasks);
  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      toolId: eligibleTools[i],
      status: "error",
      exitCode: 1,
      durationMs: 0,
      wordCount: 0,
      outputFile: "",
      stderrFile: "",
      error: r.reason?.message ?? "Unknown error"
    };
  });
}

// src/core/synthesis.ts
import { existsSync as existsSync7, readFileSync as readFileSync5 } from "fs";
import { join as join7 } from "path";
function synthesize(manifest, outputDir) {
  const parts = [
    "# Run Summary",
    "",
    `**Prompt:** ${manifest.prompt.slice(0, 100)}${manifest.prompt.length > 100 ? "..." : ""}`,
    `**Tools:** ${manifest.tools.map((t) => t.toolId).join(", ")}`,
    `**Policy:** read-only=${manifest.readOnlyPolicy}`,
    ""
  ];
  parts.push("## Results", "");
  for (const report of manifest.tools) {
    const icon = report.status === "success" ? "\u2713" : report.status === "timeout" ? "\u23F1" : "\u2717";
    const duration = (report.durationMs / 1e3).toFixed(1);
    parts.push(`### ${icon} ${report.toolId}`);
    parts.push("");
    parts.push(`- Status: ${report.status}`);
    parts.push(`- Duration: ${duration}s`);
    parts.push(`- Word count: ${report.wordCount}`);
    if (report.cost) {
      parts.push(
        `- Cost: $${report.cost.cost_usd.toFixed(2)} (${report.cost.source})`
      );
    }
    if (report.status === "error" && report.error) {
      parts.push(`- Error: ${report.error}`);
    }
    if (report.status === "success") {
      const headings = extractHeadings(outputDir, report);
      if (headings.length > 0) {
        parts.push("- Key sections:");
        for (const h of headings) {
          parts.push(`  - ${h}`);
        }
      }
    }
    parts.push("");
  }
  const costsAvailable = manifest.tools.filter((t) => t.cost);
  if (costsAvailable.length > 0) {
    parts.push("## Cost Summary", "");
    parts.push("| Tool | Cost | Source | Remaining |");
    parts.push("|------|------|--------|-----------|");
    for (const t of costsAvailable) {
      const c = t.cost;
      parts.push(
        `| ${t.toolId} | $${c.cost_usd.toFixed(2)} | ${c.source} | $${c.source === "credits" ? c.credits_remaining_usd.toFixed(2) : c.free_remaining_usd.toFixed(2)} |`
      );
    }
    parts.push("");
  }
  return parts.join("\n");
}
function synthesizeFinal(rounds, outputDir) {
  const parts = [
    "# Final Notes",
    "",
    `**Rounds completed:** ${rounds.length}`,
    ""
  ];
  for (const round of rounds) {
    const roundDir = join7(outputDir, `round-${round.round}`);
    parts.push(`## Round ${round.round}`);
    parts.push("");
    for (const report of round.tools) {
      const icon = report.status === "success" ? "\u2713" : report.status === "timeout" ? "\u23F1" : "\u2717";
      const duration = (report.durationMs / 1e3).toFixed(1);
      parts.push(`### ${icon} ${report.toolId}`);
      parts.push(
        `- Status: ${report.status} (${duration}s, ${report.wordCount} words)`
      );
      if (report.status === "success") {
        const headings = extractHeadings(roundDir, report);
        if (headings.length > 0) {
          parts.push("- Key sections:");
          for (const h of headings) {
            parts.push(`  - ${h}`);
          }
        }
      }
      parts.push("");
    }
  }
  return parts.join("\n");
}
function extractHeadings(outputDir, report) {
  const filePath = report.outputFile || join7(outputDir, `${sanitizeId(report.toolId)}.md`);
  if (!existsSync7(filePath)) return [];
  try {
    const content = readFileSync5(filePath, "utf-8");
    const headings = [];
    for (const line of content.split("\n")) {
      const match = line.match(/^#{1,3}\s+(.+)/);
      if (match) {
        headings.push(match[1].trim());
        if (headings.length >= 10) break;
      }
    }
    return headings;
  } catch {
    return [];
  }
}

// src/core/loop.ts
var MAX_PRIOR_REPORT_REFS = 8;
function totalWordCount(round) {
  return round.tools.reduce((sum, r) => sum + r.wordCount, 0);
}
async function runLoop(options) {
  const {
    config,
    toolIds,
    promptContent,
    outputDir,
    readOnlyPolicy,
    cwd,
    rounds: maxRounds,
    durationMs,
    convergenceThreshold = 0.3,
    onRoundStart,
    onRoundComplete,
    onConvergence,
    onProgress
  } = options;
  const startTime = Date.now();
  const completedRounds = [];
  let outcome = "completed";
  let aborted = false;
  let sigintCount = 0;
  const sigintHandler = () => {
    sigintCount++;
    if (sigintCount === 1) {
      aborted = true;
      outcome = "aborted";
      clearSigintExit();
    }
  };
  process.on("SIGINT", sigintHandler);
  try {
    for (let round = 1; round <= maxRounds; round++) {
      if (aborted) break;
      if (durationMs != null && round > 1 && Date.now() - startTime >= durationMs) {
        outcome = "aborted";
        break;
      }
      onRoundStart?.(round);
      const roundDir = join8(outputDir, `round-${round}`);
      mkdirSync3(roundDir, { recursive: true });
      let roundPrompt;
      const priorRoundReportPaths = collectPriorOutputPaths(
        outputDir,
        completedRounds
      );
      if (round > 1 && priorRoundReportPaths.length > 0) {
        roundPrompt = augmentPromptWithPriorOutputs(
          promptContent,
          priorRoundReportPaths
        );
      } else {
        roundPrompt = promptContent;
      }
      const roundPromptFile = resolve4(roundDir, "prompt.md");
      safeWriteFile(roundPromptFile, roundPrompt);
      const reports = await dispatch({
        config,
        toolIds,
        promptFilePath: roundPromptFile,
        promptContent: roundPrompt,
        outputDir: roundDir,
        readOnlyPolicy,
        cwd,
        onProgress
      });
      const roundManifest = {
        round,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        tools: reports
      };
      const roundSynthesis = synthesize(
        {
          timestamp: roundManifest.timestamp,
          slug: `round-${round}`,
          prompt: roundPrompt.slice(0, 200),
          promptSource: "inline",
          readOnlyPolicy,
          tools: reports
        },
        roundDir
      );
      safeWriteFile(resolve4(roundDir, "round-notes.md"), roundSynthesis);
      completedRounds.push(roundManifest);
      onRoundComplete?.(round, roundManifest);
      if (completedRounds.length >= 2) {
        const prevWords = totalWordCount(
          completedRounds[completedRounds.length - 2]
        );
        const curWords = totalWordCount(roundManifest);
        if (prevWords > 0) {
          const ratio = curWords / prevWords;
          if (ratio < convergenceThreshold) {
            outcome = "converged";
            onConvergence?.(round, ratio);
            break;
          }
        }
      }
    }
  } finally {
    process.removeListener("SIGINT", sigintHandler);
  }
  return { rounds: completedRounds, outcome };
}
function collectPriorOutputPaths(outputDir, rounds) {
  const paths = [];
  for (const round of rounds) {
    const roundDir = join8(outputDir, `round-${round.round}`);
    try {
      for (const file of readdirSync3(roundDir)) {
        if (file.endsWith(".md") && file !== "prompt.md" && file !== "round-notes.md") {
          paths.push(join8(roundDir, file));
        }
      }
    } catch {
    }
  }
  return paths;
}
function augmentPromptWithPriorOutputs(basePrompt, priorRoundReportPaths) {
  const cappedPaths = priorRoundReportPaths.slice(-MAX_PRIOR_REPORT_REFS);
  const omittedCount = priorRoundReportPaths.length - cappedPaths.length;
  const refs = cappedPaths.map((p) => `@${p}`).join("\n");
  const capNote = omittedCount > 0 ? `
Only the most recent ${MAX_PRIOR_REPORT_REFS} outputs are included to control prompt size (${omittedCount} older output(s) omitted).
` : "";
  return `${basePrompt}

## Prior Round Outputs

The following files contain outputs from previous rounds. Use them to improve quality, not just avoid duplicates.

${capNote}

Round instructions:
- Do not repeat the same finding unless you add meaningful new evidence.
- Challenge prior findings: try to invalidate, narrow, or refine high-impact claims.
- Treat prior findings as leads: follow adjacent code paths, shared utilities, and similar patterns.
- For any finding that overlaps prior rounds, clearly label status as confirmed, refined, invalidated, or duplicate and explain what is new.

${refs}
`;
}

// src/core/prompt-builder.ts
import { mkdirSync as mkdirSync4 } from "fs";
import { basename as basename2, dirname as dirname4, join as join9, resolve as resolve5 } from "path";
function secondsTimestamp() {
  return Math.floor(Date.now() / 1e3);
}
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, MAX_SLUG_LENGTH).replace(/^-|-$/g, "") || "untitled";
}
function generateSlug(text) {
  return `${secondsTimestamp()}-${slugify(text)}`;
}
function generateSlugFromFile(filePath) {
  const dir = dirname4(filePath);
  const dirName = basename2(dir);
  if (dirName && dirName !== "." && dirName !== "..") {
    return `${secondsTimestamp()}-${slugify(dirName)}`;
  }
  return `${secondsTimestamp()}-${slugify(basename2(filePath, ".md"))}`;
}
function resolveOutputDir(baseDir, slug) {
  let outputDir = resolve5(join9(baseDir, slug));
  try {
    mkdirSync4(outputDir, { recursive: false });
  } catch (e) {
    if (e.code === "EEXIST") {
      outputDir = `${outputDir}-${Date.now()}`;
      mkdirSync4(outputDir, { recursive: true });
    } else {
      mkdirSync4(outputDir, { recursive: true });
    }
  }
  return outputDir;
}
function buildPrompt(question, context) {
  const parts = [
    "# Second Opinion Request",
    "",
    "## Question",
    question,
    ""
  ];
  if (context) {
    parts.push("## Context", "", context, "");
  }
  parts.push(
    "## Instructions",
    "You are providing an independent second opinion. Be critical and thorough.",
    "- Analyze the question in the context provided",
    "- Identify risks, tradeoffs, and blind spots",
    "- Suggest alternatives if you see better approaches",
    "- Be direct and opinionated \u2014 don't hedge",
    "- Structure your response with clear headings",
    "- Keep your response focused and actionable",
    ""
  );
  return parts.join("\n");
}

// src/core/prompt-writer.ts
import { mkdtempSync, rmSync as rmSync3, writeFileSync as writeFileSync4 } from "fs";
import { tmpdir } from "os";
import { join as join10 } from "path";
async function writePrompt(options) {
  const {
    config,
    toolId,
    cwd,
    userInput,
    presetDescription,
    repoContext,
    onProgress
  } = options;
  const toolConfig = config.tools[toolId];
  if (!toolConfig) {
    throw new Error(`Tool "${toolId}" not configured for prompt writing.`);
  }
  const adapter = resolveAdapter(toolId, toolConfig);
  const prompt = `You are a prompt-writing agent. Your job is to write a detailed prompt that other AI coding agents will follow to analyze a software project.

## User's Focus
${userInput}

## Preset Description
${presetDescription}

## Repository Context
${repoContext}

## Your Task
Write a comprehensive, self-contained prompt that instructs AI coding agents to perform the analysis described above. The prompt should:

1. Clearly state the objective based on the preset description and user's focus area
2. Reference specific directories and technologies from the repository context
3. Be detailed enough that agents can work independently without further clarification
4. Include what to look for and how to structure findings

Output ONLY the prompt text. Do not include any meta-commentary, markdown fences, or explanation \u2014 your entire output will be used directly as the prompt.`;
  const tmpDir = mkdtempSync(join10(tmpdir(), "counselors-prompt-writer-"));
  const promptFile = join10(tmpDir, "meta-prompt.md");
  writeFileSync4(promptFile, prompt, "utf-8");
  const timeout = toolConfig.timeout ?? config.defaults.timeout;
  const invocation = adapter.buildInvocation({
    prompt,
    promptFilePath: promptFile,
    toolId,
    outputDir: tmpDir,
    readOnlyPolicy: "enforced",
    timeout,
    cwd,
    binary: toolConfig.binary,
    extraFlags: toolConfig.extraFlags
  });
  let result;
  try {
    result = await execute(invocation, timeout * 1e3, (pid) => {
      onProgress?.({ toolId, event: "started", pid });
    });
  } finally {
    try {
      rmSync3(tmpDir, { recursive: true, force: true });
    } catch {
    }
  }
  onProgress?.({
    toolId,
    event: "completed",
    report: buildToolReport(toolId, result)
  });
  if (result.timedOut) {
    throw new Error(`Prompt writing timed out after ${timeout}s.`);
  }
  if (result.exitCode !== 0) {
    throw new Error(
      `Prompt writing failed (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`
    );
  }
  return { generatedPrompt: result.stdout.trim() };
}

// src/core/repo-discovery.ts
import { mkdtempSync as mkdtempSync2, rmSync as rmSync4, writeFileSync as writeFileSync5 } from "fs";
import { tmpdir as tmpdir2 } from "os";
import { join as join11 } from "path";
async function runRepoDiscovery(options) {
  const { config, toolId, cwd, target, onProgress } = options;
  const toolConfig = config.tools[toolId];
  if (!toolConfig) {
    throw new Error(`Tool "${toolId}" not configured for discovery.`);
  }
  const adapter = resolveAdapter(toolId, toolConfig);
  const targetClause = target ? `The user wants to focus on: "${target}". Resolve this into concrete directories/files that exist in the project.` : "Analyze the entire project.";
  const prompt = `You are analyzing a software project to understand its structure.

Working directory: ${cwd}

${targetClause}

Identify the following and output them as plain text (no JSON, no markdown fences):

1. **Main tech stack(s)**: Languages, frameworks, and build tools used.
2. **Main modules/directories**: Source code directories worth exploring (not vendor, node_modules, or generated files).

Be concise. This output will be passed to another agent as context for a more detailed task.`;
  const tmpDir = mkdtempSync2(join11(tmpdir2(), "counselors-discover-"));
  const promptFile = join11(tmpDir, "discover-prompt.md");
  writeFileSync5(promptFile, prompt, "utf-8");
  const timeout = toolConfig.timeout ?? config.defaults.timeout;
  const invocation = adapter.buildInvocation({
    prompt,
    promptFilePath: promptFile,
    toolId,
    outputDir: tmpDir,
    readOnlyPolicy: "enforced",
    timeout,
    cwd,
    binary: toolConfig.binary,
    extraFlags: toolConfig.extraFlags
  });
  let result;
  try {
    result = await execute(invocation, timeout * 1e3, (pid) => {
      onProgress?.({ toolId, event: "started", pid });
    });
  } finally {
    try {
      rmSync4(tmpDir, { recursive: true, force: true });
    } catch {
    }
  }
  onProgress?.({
    toolId,
    event: "completed",
    report: buildToolReport(toolId, result)
  });
  if (result.timedOut) {
    throw new Error(
      `Discovery timed out after ${timeout}s. Try a simpler target.`
    );
  }
  if (result.exitCode !== 0) {
    throw new Error(
      `Discovery failed (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`
    );
  }
  return { repoContext: result.stdout.trim() };
}

// src/presets/index.ts
import { existsSync as existsSync8, readdirSync as readdirSync4, readFileSync as readFileSync6 } from "fs";
import { dirname as dirname5, join as join12, resolve as resolve6 } from "path";
import { fileURLToPath } from "url";
import { parse as parseYaml } from "yaml";

// src/presets/types.ts
import { z as z3 } from "zod";
var PresetDefinitionSchema = z3.object({
  name: z3.string(),
  description: z3.string(),
  defaultRounds: z3.number().optional(),
  defaultReadOnly: z3.enum(["enforced", "bestEffort", "none"]).optional()
});

// src/presets/index.ts
function findPackageRoot() {
  let dir = dirname5(fileURLToPath(import.meta.url));
  while (dir !== dirname5(dir)) {
    if (existsSync8(join12(dir, "package.json"))) {
      return dir;
    }
    dir = dirname5(dir);
  }
  throw new Error("Could not find package root (no package.json found)");
}
function builtinPresetsDir() {
  return join12(findPackageRoot(), "assets", "presets");
}
function isFilePath(input2) {
  return input2.includes("/") || input2.includes("\\") || input2.endsWith(".yml") || input2.endsWith(".yaml");
}
function parsePresetYaml(content, source) {
  let raw;
  try {
    raw = parseYaml(content);
  } catch (err) {
    throw new Error(
      `Invalid YAML in preset "${source}": ${err instanceof Error ? err.message : err}`
    );
  }
  const result = PresetDefinitionSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid preset "${source}":
${issues}`);
  }
  return result.data;
}
function resolvePreset(input2) {
  if (isFilePath(input2)) {
    const filePath2 = resolve6(input2);
    if (!existsSync8(filePath2)) {
      throw new Error(`Preset file not found: ${filePath2}`);
    }
    const content2 = readFileSync6(filePath2, "utf-8");
    return parsePresetYaml(content2, filePath2);
  }
  const dir = builtinPresetsDir();
  const filePath = join12(dir, `${input2}.yml`);
  if (!existsSync8(filePath)) {
    const available = getPresetNames().join(", ");
    throw new Error(
      `Unknown preset "${input2}". Available presets: ${available}`
    );
  }
  const content = readFileSync6(filePath, "utf-8");
  return parsePresetYaml(content, filePath);
}
function getPresetNames() {
  const dir = builtinPresetsDir();
  if (!existsSync8(dir)) return [];
  return readdirSync4(dir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml")).map((f) => f.replace(/\.ya?ml$/, "")).sort();
}

// src/ui/agent-reporter.ts
var HEARTBEAT_INTERVAL = 6e4;
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1e3);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}
var AgentReporter = class {
  tools = /* @__PURE__ */ new Map();
  toolOrder = [];
  heartbeatInterval = null;
  heartbeatStart = 0;
  executionStart = 0;
  durationMs;
  // ── Preset phases ──
  discoveryStarted(toolId) {
    this.stderr(`  \u25B8 Discovery phase: ${toolId}`);
  }
  discoveryCompleted(_toolId) {
    this.stderr("  \u2713 Discovery complete");
  }
  promptWritingStarted(toolId) {
    this.stderr(`  \u25B8 Prompt-writing phase: ${toolId}`);
  }
  promptWritingCompleted(_toolId) {
    this.stderr("  \u2713 Prompt-writing complete");
  }
  phasePidReported(toolId, pid) {
    this.stderr(`  \u25B8 PID ${pid}  ${toolId} (phase)`);
  }
  // ── Execution lifecycle ──
  executionStarted(outputDir, toolIds, opts) {
    this.executionStart = Date.now();
    this.durationMs = opts?.durationMs;
    const displayDir = outputDir;
    this.tools.clear();
    this.toolOrder = [];
    for (const id of toolIds) {
      this.tools.set(id, { toolId: id, phase: "pending" });
      this.toolOrder.push(id);
    }
    this.stderr(`  Output: ${displayDir}`);
    this.stderr("  \u2139 This may take more than 10 minutes");
    this.stderr(`  PID: ${process.pid}`);
    if (this.durationMs) {
      this.stderr(
        `  Duration: ${formatDuration(this.durationMs)} \u2014 no new rounds after that, but in-flight rounds will complete`
      );
    }
  }
  toolStarted(toolId, pid) {
    const tool = this.tools.get(toolId);
    if (!tool) return;
    tool.phase = "running";
    tool.pid = pid;
    const pidStr = pid ? `PID ${pid}  ` : "";
    this.stderr(`  \u25B8 ${pidStr}${toolId} started`);
    this.startHeartbeat();
  }
  toolCompleted(toolId, report) {
    const tool = this.tools.get(toolId);
    if (!tool) return;
    tool.phase = "done";
    const duration = (report.durationMs / 1e3).toFixed(1);
    const icon = report.status === "success" ? "\u2713" : report.status === "timeout" ? "\u23F1" : "\u2717";
    this.stderr(
      `  ${icon} ${toolId} done  ${duration}s  ${report.wordCount.toLocaleString()} words`
    );
    if (report.status !== "success" && report.stderrFile) {
      this.stderr(`    \u2514 see ${report.stderrFile}`);
    }
  }
  executionFinished() {
    this.stopHeartbeat();
  }
  // ── Round management ──
  roundStarted(round, totalRounds) {
    if (round > 1) {
      const elapsed = Date.now() - this.executionStart;
      let timing = `${formatDuration(elapsed)} elapsed`;
      if (this.durationMs) {
        const remaining = Math.max(0, this.durationMs - elapsed);
        timing += ` \xB7 ~${formatDuration(remaining)} remaining`;
      }
      timing += " \xB7 Ctrl+C to stop";
      this.stderr(`  ${timing}`);
    }
    const roundLabel = totalRounds != null ? `${round}/${totalRounds}` : `${round}`;
    this.stderr(`  \u2500\u2500 Round ${roundLabel} \u2500\u2500`);
    for (const [id] of this.tools) {
      this.tools.set(id, { toolId: id, phase: "pending" });
    }
  }
  roundCompleted(_round) {
  }
  convergenceDetected(round, ratio, threshold) {
    this.stderr(
      `  Convergence at round ${round} (ratio: ${ratio.toFixed(2)} < ${threshold})`
    );
  }
  // ── Summary ──
  printSummary(manifest, opts) {
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(manifest, null, 2)}
`);
    } else {
      process.stdout.write(`${formatRunSummary(manifest)}
`);
    }
  }
  // ── Private ──
  stderr(line) {
    process.stderr.write(`${line}
`);
  }
  startHeartbeat() {
    if (this.heartbeatInterval != null) return;
    this.heartbeatStart = Date.now();
    this.heartbeatInterval = setInterval(() => {
      const elapsed = formatDuration(Date.now() - this.heartbeatStart);
      const activePids = this.toolOrder.map((id) => this.tools.get(id)).filter((t) => t.phase === "running" && t.pid).map((t) => t.pid);
      const pids = activePids.length > 0 ? ` (PIDs: ${activePids.join(", ")})` : "";
      this.stderr(`  heartbeat: ${elapsed} elapsed${pids}`);
    }, HEARTBEAT_INTERVAL);
    this.heartbeatInterval.unref();
  }
  stopHeartbeat() {
    if (this.heartbeatInterval == null) return;
    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
  }
};

// src/ui/terminal-reporter.ts
var SPINNER_FRAMES = ["\u25D0", "\u25D3", "\u25D1", "\u25D2"];
var TICK_INTERVAL = 200;
var LABEL_COL_WIDTH = 40;
var RED = "\x1B[31m";
var DIM = "\x1B[2m";
var GREEN = "\x1B[32m";
var BOLD = "\x1B[1m";
var RESET = "\x1B[0m";
function formatDuration2(ms) {
  const seconds = Math.floor(ms / 1e3);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}
var TerminalReporter = class {
  tools = /* @__PURE__ */ new Map();
  toolOrder = [];
  outputDir = "";
  timer = null;
  frame = 0;
  lineCount = 0;
  currentRound = null;
  totalRounds = null;
  executionActive = false;
  executionStart = 0;
  durationMs;
  phaseSpinner = null;
  phaseFrame = 0;
  phaseText = "";
  // ── Preset phases ──
  discoveryStarted(toolId) {
    this.startPhaseSpinner(`Discovery phase: ${toolId}`);
  }
  discoveryCompleted(_toolId) {
    this.stopPhaseSpinner();
    this.stderr(`  ${GREEN}\u2713${RESET} Discovery complete`);
  }
  promptWritingStarted(toolId) {
    this.startPhaseSpinner(`Prompt-writing phase: ${toolId}`);
  }
  promptWritingCompleted(_toolId) {
    this.stopPhaseSpinner();
    this.stderr(`  ${GREEN}\u2713${RESET} Prompt-writing complete`);
  }
  phasePidReported(toolId, pid) {
    this.phaseText = `${this.phaseText.split(" (PID")[0]} (PID ${pid})`;
    this.renderPhase();
  }
  // ── Execution lifecycle ──
  executionStarted(outputDir, toolIds, opts) {
    this.executionStart = Date.now();
    this.durationMs = opts?.durationMs;
    this.outputDir = outputDir;
    this.tools.clear();
    this.toolOrder = [];
    for (const id of toolIds) {
      this.tools.set(id, { toolId: id, phase: "pending" });
      this.toolOrder.push(id);
    }
    this.executionActive = true;
    if (this.durationMs) {
      this.stderr(
        `  Duration: ${formatDuration2(this.durationMs)} \u2014 no new rounds after that, but in-flight rounds will complete`
      );
    }
    this.render();
    this.timer = setInterval(() => {
      this.frame++;
      this.render();
    }, TICK_INTERVAL);
  }
  toolStarted(toolId, pid) {
    const tool = this.tools.get(toolId);
    if (!tool) return;
    tool.phase = "running";
    tool.startedAt = Date.now();
    tool.pid = pid;
  }
  toolCompleted(toolId, report) {
    const tool = this.tools.get(toolId);
    if (!tool) return;
    tool.phase = "done";
    tool.report = report;
  }
  executionFinished() {
    this.executionActive = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.render();
  }
  // ── Round management ──
  roundStarted(round, totalRounds) {
    this.currentRound = round;
    this.totalRounds = totalRounds;
    if (round > 1) {
      this.render();
      this.lineCount = 0;
      const elapsed = Date.now() - this.executionStart;
      let timing = `${formatDuration2(elapsed)} elapsed`;
      if (this.durationMs) {
        const remaining = Math.max(0, this.durationMs - elapsed);
        timing += ` \xB7 ~${formatDuration2(remaining)} remaining`;
      }
      timing += ` \xB7 Ctrl+C to stop`;
      this.stderr(`  ${DIM}${timing}${RESET}`);
    }
    for (const [id] of this.tools) {
      this.tools.set(id, { toolId: id, phase: "pending" });
    }
  }
  roundCompleted(_round) {
  }
  convergenceDetected(round, ratio, threshold) {
    this.clearStatus();
    this.stderr(
      `  ${BOLD}Convergence${RESET} at round ${round} (ratio: ${ratio.toFixed(2)} < ${threshold})`
    );
    this.restoreStatus();
  }
  // ── Summary ──
  printSummary(manifest, opts) {
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(manifest, null, 2)}
`);
    } else {
      process.stdout.write(`${formatRunSummary(manifest)}
`);
    }
  }
  // ── Private: phase spinner (pre-execution) ──
  startPhaseSpinner(text) {
    this.phaseText = text;
    this.phaseFrame = 0;
    this.renderPhase();
    this.phaseSpinner = setInterval(() => {
      this.phaseFrame++;
      this.renderPhase();
    }, TICK_INTERVAL);
  }
  stopPhaseSpinner() {
    if (this.phaseSpinner) {
      clearInterval(this.phaseSpinner);
      this.phaseSpinner = null;
    }
    process.stderr.write("\x1B[1A\x1B[K");
  }
  renderPhase() {
    const spinner = SPINNER_FRAMES[this.phaseFrame % SPINNER_FRAMES.length];
    if (this.phaseFrame > 0) {
      process.stderr.write("\x1B[1A");
    }
    process.stderr.write(`\x1B[K  ${spinner} ${this.phaseText}
`);
  }
  // ── Private: tool table rendering ──
  clearStatus() {
    if (this.lineCount > 0) {
      process.stderr.write(`\x1B[${this.lineCount}A`);
      for (let i = 0; i < this.lineCount; i++) {
        process.stderr.write("\x1B[K\n");
      }
      process.stderr.write(`\x1B[${this.lineCount}A`);
    }
  }
  restoreStatus() {
    if (this.executionActive) this.render();
  }
  stderr(line) {
    process.stderr.write(`${line}
`);
  }
  render() {
    const lines = [];
    if (this.currentRound != null) {
      const roundLabel = this.totalRounds != null ? `${this.currentRound}/${this.totalRounds}` : `${this.currentRound}`;
      lines.push(`  Round ${roundLabel}`);
    }
    lines.push(`  ${DIM}Output: ${this.outputDir}${RESET}`);
    const anyStarted = this.toolOrder.some(
      (id) => this.tools.get(id).phase !== "pending"
    );
    if (anyStarted) {
      lines.push("  \u2139 This may take more than 10 minutes");
      lines.push(`  PID: ${process.pid}`);
    }
    for (const id of this.toolOrder) {
      const tool = this.tools.get(id);
      lines.push(this.formatLine(tool));
      if (tool.phase === "done" && tool.report?.status !== "success" && tool.report?.stderrFile) {
        lines.push(`    ${RED}\u2514 see ${tool.report.stderrFile}${RESET}`);
      }
    }
    if (this.lineCount > 0) {
      process.stderr.write(`\x1B[${this.lineCount}A`);
    }
    for (const line of lines) {
      process.stderr.write(`\x1B[K${line}
`);
    }
    this.lineCount = lines.length;
  }
  formatLine(tool) {
    const label = tool.toolId;
    switch (tool.phase) {
      case "pending": {
        const pad = " ".repeat(Math.max(0, LABEL_COL_WIDTH - label.length));
        return `  \u23F3 ${label}${pad}pending`;
      }
      case "running": {
        const spinner = SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length];
        const elapsed = tool.startedAt ? ((Date.now() - tool.startedAt) / 1e3).toFixed(1) : "0.0";
        const pidPrefix = tool.pid ? `PID ${tool.pid}  ` : "";
        const fullLabel = `${pidPrefix}${label}`;
        const pad = " ".repeat(Math.max(0, LABEL_COL_WIDTH - fullLabel.length));
        return `  ${spinner} ${fullLabel}${pad}running  ${elapsed.padStart(6)}s`;
      }
      case "done": {
        const report = tool.report;
        const icon = report.status === "success" ? "\u2713" : report.status === "timeout" ? "\u23F1" : "\u2717";
        const duration = (report.durationMs / 1e3).toFixed(1);
        const pad = " ".repeat(Math.max(0, LABEL_COL_WIDTH - label.length));
        return `  ${icon} ${label}${pad}done    ${duration.padStart(6)}s  ${report.wordCount.toLocaleString()} words`;
      }
    }
  }
};

// src/ui/reporter.ts
var NullReporter = class {
  discoveryStarted() {
  }
  discoveryCompleted() {
  }
  promptWritingStarted() {
  }
  promptWritingCompleted() {
  }
  phasePidReported() {
  }
  executionStarted() {
  }
  toolStarted() {
  }
  toolCompleted() {
  }
  executionFinished() {
  }
  roundStarted() {
  }
  roundCompleted() {
  }
  convergenceDetected() {
  }
  printSummary() {
  }
};
function createReporter(opts) {
  if (opts?.dryRun) return new NullReporter();
  if (process.stderr.isTTY) return new TerminalReporter();
  return new AgentReporter();
}

// src/commands/_run-shared.ts
import { copyFileSync, readFileSync as readFileSync8 } from "fs";
import { basename as basename3, dirname as dirname6, resolve as resolve8, sep } from "path";

// src/core/context.ts
import { execFileSync as execFileSync4 } from "child_process";
import { readFileSync as readFileSync7, statSync as statSync2 } from "fs";
import { resolve as resolve7 } from "path";
function safeFence(content) {
  let fence = "```";
  while (content.includes(fence)) fence += "`";
  return fence;
}
function truncateUtf8(str, maxBytes) {
  const buf = Buffer.from(str);
  if (buf.length <= maxBytes) return str;
  let end = maxBytes;
  while (end > 0 && (buf[end] & 192) === 128) end--;
  if (end > 0) {
    const lead = buf[end - 1];
    const seqLen = (lead & 224) === 192 ? 2 : (lead & 240) === 224 ? 3 : (lead & 248) === 240 ? 4 : 1;
    if (end - 1 + seqLen > maxBytes) end--;
  }
  return buf.subarray(0, end).toString("utf-8");
}
function gatherContext(cwd, paths, maxKb = DEFAULT_MAX_CONTEXT_KB) {
  const parts = [];
  let totalBytes = 0;
  const maxBytes = maxKb * 1024;
  if (paths.length > 0) {
    parts.push("### Files Referenced", "");
    for (const p of paths) {
      if (totalBytes >= maxBytes) {
        debug(`Context limit reached (${maxKb}KB), skipping remaining files`);
        break;
      }
      const fullPath = resolve7(cwd, p);
      try {
        const stat = statSync2(fullPath);
        if (!stat.isFile()) continue;
        if (stat.size > maxBytes - totalBytes) {
          debug(`Skipping ${p} \u2014 too large (${stat.size} bytes)`);
          continue;
        }
        const content = readFileSync7(fullPath, "utf-8");
        const fence = safeFence(content);
        parts.push(`#### ${p}`, "", fence, content, fence, "");
        totalBytes += Buffer.byteLength(content);
      } catch {
        debug(`Could not read ${p}`);
      }
    }
  }
  if (totalBytes < maxBytes) {
    const diff = getGitDiff(cwd);
    if (diff) {
      const diffBytes = Buffer.byteLength(diff);
      if (totalBytes + diffBytes <= maxBytes) {
        const fence = safeFence(diff);
        parts.push(
          "### Recent Changes (Git Diff)",
          "",
          `${fence}diff`,
          diff,
          fence,
          ""
        );
        totalBytes += diffBytes;
      } else {
        const remaining = maxBytes - totalBytes;
        const truncated = truncateUtf8(diff, remaining);
        const fence = safeFence(truncated);
        parts.push(
          "### Recent Changes (Git Diff) [truncated]",
          "",
          `${fence}diff`,
          truncated,
          fence,
          ""
        );
        totalBytes = maxBytes;
      }
    }
  }
  return parts.join("\n");
}
function getGitDiff(cwd) {
  try {
    const staged = execFileSync4("git", ["diff", "--staged"], {
      cwd,
      encoding: "utf-8",
      timeout: 1e4,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    const unstaged = execFileSync4("git", ["diff"], {
      cwd,
      encoding: "utf-8",
      timeout: 1e4,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    const parts = [];
    if (staged) parts.push(staged);
    if (unstaged) parts.push(unstaged);
    return parts.length > 0 ? parts.join("\n") : null;
  } catch {
    return null;
  }
}

// src/commands/_run-shared.ts
function expandDuplicateToolIds(toolIds, config) {
  const used = new Set(Object.keys(config.tools));
  const nextSuffix = {};
  let expandedTools = null;
  const expanded = [];
  for (const id of toolIds) {
    const next = nextSuffix[id] ?? 1;
    if (next === 1) {
      nextSuffix[id] = 2;
      expanded.push(id);
      continue;
    }
    let suffix = next;
    let candidate = `${id}__${suffix}`;
    while (used.has(candidate)) {
      suffix++;
      candidate = `${id}__${suffix}`;
    }
    nextSuffix[id] = suffix + 1;
    if (!expandedTools) expandedTools = { ...config.tools };
    const baseConfig = config.tools[id];
    if (baseConfig) {
      const needsAdapter = !baseConfig.adapter && isBuiltInTool(id);
      expandedTools[candidate] = needsAdapter ? { ...baseConfig, adapter: id } : baseConfig;
    }
    used.add(candidate);
    expanded.push(candidate);
  }
  if (!expandedTools) return { toolIds, config };
  return { toolIds: expanded, config: { ...config, tools: expandedTools } };
}
async function resolveTools(opts, cwd) {
  const globalConfig = loadConfig();
  const projectConfig = loadProjectConfig(cwd);
  let config = mergeConfigs(globalConfig, projectConfig);
  const groupNames = opts.group ? opts.group.split(",").map((g) => g.trim()).filter(Boolean) : [];
  const explicitSelection = Boolean(opts.tools || groupNames.length > 0);
  const groupToolIds = [];
  if (groupNames.length > 0) {
    for (const groupName of groupNames) {
      const ids = config.groups[groupName];
      if (!ids) {
        error(
          `Group "${groupName}" is not configured. Run "counselors groups list".`
        );
        process.exitCode = 1;
        return null;
      }
      for (const id of ids) {
        if (!config.tools[id]) {
          error(
            `Group "${groupName}" references tool "${id}", but it is not configured.`
          );
          process.exitCode = 1;
          return null;
        }
      }
      groupToolIds.push(...ids);
    }
  }
  const explicitToolIds = opts.tools ? opts.tools.split(",").map((t) => t.trim()).filter(Boolean) : [];
  let toolIds;
  if (explicitSelection) {
    const groupSet = new Set(groupToolIds);
    const dedupedExplicit = explicitToolIds.filter((id) => !groupSet.has(id));
    toolIds = [...groupToolIds, ...dedupedExplicit];
  } else {
    toolIds = Object.keys(config.tools);
  }
  if (toolIds.length === 0) {
    if (Object.keys(config.tools).length === 0) {
      error('No tools configured. Run "counselors init" first.');
    } else {
      error("No tools selected.");
    }
    process.exitCode = 1;
    return null;
  }
  for (const id of toolIds) {
    if (!config.tools[id]) {
      error(`Tool "${id}" not configured. Run "counselors tools add ${id}".`);
      process.exitCode = 1;
      return null;
    }
  }
  if (!explicitSelection && !opts.dryRun && process.stderr.isTTY && toolIds.length > 1) {
    const selected = await selectRunTools(toolIds);
    if (selected.length === 0) {
      error("No tools selected.");
      process.exitCode = 1;
      return null;
    }
    toolIds = selected;
  }
  const expanded = expandDuplicateToolIds(toolIds, config);
  toolIds = expanded.toolIds;
  config = expanded.config;
  return { toolIds, config };
}
var READ_ONLY_MAP = [
  ["strict", "enforced"],
  ["best-effort", "bestEffort"],
  ["off", "none"]
];
var cliToInternal = new Map(READ_ONLY_MAP.map(([c, i]) => [c, i]));
var internalToCli = new Map(READ_ONLY_MAP.map(([c, i]) => [i, c]));
function resolveReadOnlyPolicy(readOnlyInput, config) {
  const input2 = readOnlyInput ?? internalToCli.get(config.defaults.readOnly) ?? "best-effort";
  const policy = cliToInternal.get(input2);
  if (!policy) {
    error(
      `Invalid --read-only value "${input2}". Must be: strict, best-effort, or off.`
    );
    process.exitCode = 1;
    return null;
  }
  return policy;
}
async function resolvePrompt(promptArg, opts, cwd, config) {
  if (opts.file) {
    const filePath = resolve8(cwd, opts.file);
    let promptContent;
    try {
      promptContent = readFileSync8(filePath, "utf-8");
    } catch {
      error(`Cannot read prompt file: ${filePath}`);
      process.exitCode = 1;
      return null;
    }
    if (opts.context) {
      const context2 = gatherContext(
        cwd,
        opts.context === "." ? [] : opts.context.split(","),
        config.defaults.maxContextKb
      );
      if (context2) promptContent = `${promptContent}

${context2}`;
    }
    return {
      promptContent,
      promptSource: "file",
      slug: generateSlugFromFile(filePath)
    };
  }
  if (promptArg) {
    const context2 = opts.context ? gatherContext(
      cwd,
      opts.context === "." ? [] : opts.context.split(","),
      config.defaults.maxContextKb
    ) : void 0;
    return {
      promptContent: buildPrompt(promptArg, context2),
      promptSource: "inline",
      slug: generateSlug(promptArg)
    };
  }
  if (process.stdin.isTTY) {
    error(
      "No prompt provided. Pass as argument, use -f <file>, or pipe via stdin."
    );
    process.exitCode = 1;
    return null;
  }
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const stdinContent = Buffer.concat(chunks).toString("utf-8").trim();
  if (!stdinContent) {
    error("Empty prompt from stdin.");
    process.exitCode = 1;
    return null;
  }
  const context = opts.context ? gatherContext(
    cwd,
    opts.context === "." ? [] : opts.context.split(","),
    config.defaults.maxContextKb
  ) : void 0;
  const enrichStdinPrompt = opts.enrichStdinPrompt ?? true;
  return {
    promptContent: enrichStdinPrompt ? buildPrompt(stdinContent, context) : context ? `${stdinContent}

${context}` : stdinContent,
    promptSource: "stdin",
    slug: generateSlug(stdinContent)
  };
}
function createOutputDir(opts, slug, promptContent, cwd, config) {
  const baseDir = opts.outputDir || config.defaults.outputDir;
  if (opts.file) {
    const absFile = resolve8(cwd, opts.file);
    const fileDir = dirname6(absFile);
    const resolvedBase = resolve8(cwd, baseDir);
    if (fileDir.startsWith(resolvedBase + sep) && fileDir !== resolvedBase) {
      return { outputDir: fileDir, promptFilePath: absFile };
    }
    const outputDir2 = resolveOutputDir(baseDir, slug);
    const promptFilePath2 = resolve8(outputDir2, "prompt.md");
    copyFileSync(absFile, promptFilePath2);
    return { outputDir: outputDir2, promptFilePath: promptFilePath2 };
  }
  const outputDir = resolveOutputDir(baseDir, slug);
  const promptFilePath = resolve8(outputDir, "prompt.md");
  safeWriteFile(promptFilePath, promptContent);
  return { outputDir, promptFilePath };
}
function buildDryRunInvocations(config, toolIds, promptContent, outputDir, readOnlyPolicy, cwd) {
  const promptFilePath = resolve8(outputDir, "prompt.md");
  return toolIds.map((id) => {
    const toolConfig = config.tools[id];
    const adapter = resolveAdapter(id, toolConfig);
    const inv = adapter.buildInvocation({
      prompt: promptContent,
      promptFilePath,
      toolId: id,
      outputDir,
      readOnlyPolicy,
      timeout: config.defaults.timeout,
      cwd,
      binary: toolConfig.binary,
      extraFlags: toolConfig.extraFlags
    });
    return {
      toolId: id,
      cmd: inv.cmd,
      args: inv.args
    };
  });
}
function getPromptLabel(promptArg, file) {
  return promptArg || (file ? `file:${basename3(file)}` : "stdin");
}

// src/commands/loop.ts
var INLINE_PROMPT_ENHANCEMENT_DESCRIPTION = `You are preparing a multi-round code review prompt from a raw user request (no preset selected). Preserve the user's intent and success criteria, then expand it into a concrete execution prompt grounded in the discovered repository context. Require evidence-backed findings with file/function references, clear risk framing, and concrete fix suggestions.`;
function withExecutionBoilerplate(promptContent) {
  const content = promptContent.trimEnd();
  const boilerplate = getExecutionBoilerplate().trim();
  if (content.includes(boilerplate)) return content;
  return content.length > 0 ? `${content}

${boilerplate}` : boilerplate;
}
function registerLoopCommand(program2) {
  const loopCmd = program2.command("loop [prompt]").description(
    "Multi-round dispatch \u2014 tools (agents) iterate, seeing prior outputs each round"
  ).option(
    "-f, --file <path>",
    "Use a pre-built prompt file (skip discovery/prompt-writing enhancement)"
  ).option("-t, --tools <tools>", "Comma-separated list of tools to use").option(
    "-g, --group <groups>",
    "Comma-separated group name(s) to run (expands to tool IDs)"
  ).option(
    "--context <paths>",
    'Gather context from paths (comma-separated, or "." for git diff)'
  ).option("--read-only <level>", "Read-only policy: strict, best-effort, off").option("--rounds <N>", "Number of dispatch rounds", "3").option("--duration <time>", 'Max total duration (e.g. "30m", "1h")').option("--preset <name>", 'Use a built-in preset (e.g. "bughunt")').option("--list-presets", "List built-in presets and exit").option(
    "--discovery-tool <id>",
    "Tool for discovery and prompt-writing phases (default: first tool)"
  ).option(
    "--no-inline-enhancement",
    "Skip discovery/prompt-writing for non-preset inline prompts"
  ).option(
    "--convergence-threshold <ratio>",
    "Word count ratio for early stop",
    "0.3"
  ).option("--dry-run", "Show what would be dispatched without running").option("--json", "Output manifest as JSON").option("-o, --output-dir <dir>", "Base output directory");
  loopCmd.action(
    async (promptArg, opts) => {
      const cwd = process.cwd();
      if (opts.listPresets) {
        const names = getPresetNames();
        if (names.length === 0) {
          info("No built-in presets found.");
          return;
        }
        info("Built-in presets:");
        for (const name of names) {
          const preset2 = resolvePreset(name);
          const firstLine = preset2.description.split("\n")[0]?.trim() ?? "";
          const rounds2 = preset2.defaultRounds ?? 3;
          info(`- ${name} (rounds: ${rounds2}): ${firstLine}`);
        }
        return;
      }
      const resolved = await resolveTools(opts, cwd);
      if (!resolved) return;
      const { toolIds, config } = resolved;
      let readOnlyPolicy = resolveReadOnlyPolicy(opts.readOnly, config);
      if (!readOnlyPolicy) return;
      const roundsExplicit = loopCmd.getOptionValueSource("rounds") === "cli";
      let rounds = Number.parseInt(opts.rounds ?? "3", 10);
      if (Number.isNaN(rounds) || rounds < 1) {
        error("--rounds must be a positive integer.");
        process.exitCode = 1;
        return;
      }
      let durationMs;
      if (opts.duration) {
        try {
          durationMs = parseDurationMs(opts.duration);
        } catch (e) {
          error(
            e instanceof Error ? e.message : `Invalid --duration value "${opts.duration}".`
          );
          process.exitCode = 1;
          return;
        }
        if (!roundsExplicit) rounds = Number.MAX_SAFE_INTEGER;
      }
      const convergenceThreshold = Number.parseFloat(
        opts.convergenceThreshold ?? "0.3"
      );
      if (Number.isNaN(convergenceThreshold) || convergenceThreshold < 0 || convergenceThreshold > 1) {
        error("--convergence-threshold must be a number between 0 and 1.");
        process.exitCode = 1;
        return;
      }
      let preset;
      if (opts.preset) {
        try {
          preset = resolvePreset(opts.preset);
        } catch (e) {
          error(
            e instanceof Error ? e.message : `Unknown preset "${opts.preset}".`
          );
          process.exitCode = 1;
          return;
        }
        if (!roundsExplicit && !durationMs && preset.defaultRounds) {
          rounds = preset.defaultRounds;
        }
        if (!opts.readOnly && preset.defaultReadOnly) {
          readOnlyPolicy = preset.defaultReadOnly;
        }
      }
      let promptContent;
      let promptSource;
      let slug;
      const reporter = createReporter({ dryRun: opts.dryRun });
      const getDiscoveryToolId = () => {
        const discoveryToolId = opts.discoveryTool ?? toolIds[0];
        if (!config.tools[discoveryToolId]) {
          error(`Discovery tool "${discoveryToolId}" not configured.`);
          process.exitCode = 1;
          return null;
        }
        return discoveryToolId;
      };
      if (preset) {
        if (!promptArg) {
          error(
            `Preset "${preset.name}" requires a prompt argument describing what to focus on.`
          );
          process.exitCode = 1;
          return;
        }
        const discoveryToolId = getDiscoveryToolId();
        if (!discoveryToolId) return;
        slug = generateSlug(preset.name);
        promptSource = "inline";
        if (opts.dryRun) {
          promptContent = `[Generated by ${preset.name} preset after discovery + prompt-writing phases]`;
        } else {
          reporter.discoveryStarted(discoveryToolId);
          let repoContext;
          try {
            const discovery = await runRepoDiscovery({
              config,
              toolId: discoveryToolId,
              cwd,
              target: promptArg,
              onProgress: (event) => {
                if (event.event === "started")
                  reporter.phasePidReported(event.toolId, event.pid);
              }
            });
            repoContext = discovery.repoContext;
          } catch (e) {
            error(
              `Discovery failed: ${e instanceof Error ? e.message : String(e)}`
            );
            process.exitCode = 1;
            return;
          }
          reporter.discoveryCompleted(discoveryToolId);
          reporter.promptWritingStarted(discoveryToolId);
          let generatedPrompt;
          try {
            const result = await writePrompt({
              config,
              toolId: discoveryToolId,
              cwd,
              userInput: promptArg,
              presetDescription: preset.description,
              repoContext,
              onProgress: (event) => {
                if (event.event === "started")
                  reporter.phasePidReported(event.toolId, event.pid);
              }
            });
            generatedPrompt = result.generatedPrompt;
          } catch (e) {
            error(
              `Prompt writing failed: ${e instanceof Error ? e.message : String(e)}`
            );
            process.exitCode = 1;
            return;
          }
          reporter.promptWritingCompleted(discoveryToolId);
          promptContent = generatedPrompt;
        }
      } else {
        const prompt = await resolvePrompt(
          promptArg,
          {
            file: opts.file,
            context: opts.context,
            enrichStdinPrompt: false
          },
          cwd,
          config
        );
        if (!prompt) return;
        promptContent = prompt.promptContent;
        promptSource = prompt.promptSource;
        slug = prompt.slug;
        const shouldEnhanceInline = promptSource === "inline" && opts.inlineEnhancement !== false;
        if (shouldEnhanceInline) {
          const discoveryToolId = getDiscoveryToolId();
          if (!discoveryToolId) return;
          if (opts.dryRun) {
            promptContent = "[Generated from inline prompt after discovery + prompt-writing phases]";
          } else {
            reporter.discoveryStarted(discoveryToolId);
            let repoContext;
            try {
              const discovery = await runRepoDiscovery({
                config,
                toolId: discoveryToolId,
                cwd,
                target: promptArg,
                onProgress: (event) => {
                  if (event.event === "started")
                    reporter.phasePidReported(event.toolId, event.pid);
                }
              });
              repoContext = discovery.repoContext;
            } catch (e) {
              error(
                `Discovery failed: ${e instanceof Error ? e.message : String(e)}`
              );
              process.exitCode = 1;
              return;
            }
            reporter.discoveryCompleted(discoveryToolId);
            reporter.promptWritingStarted(discoveryToolId);
            let generatedPrompt;
            try {
              const result = await writePrompt({
                config,
                toolId: discoveryToolId,
                cwd,
                userInput: promptArg ?? promptContent,
                presetDescription: INLINE_PROMPT_ENHANCEMENT_DESCRIPTION,
                repoContext,
                onProgress: (event) => {
                  if (event.event === "started")
                    reporter.phasePidReported(event.toolId, event.pid);
                }
              });
              generatedPrompt = result.generatedPrompt;
            } catch (e) {
              error(
                `Prompt writing failed: ${e instanceof Error ? e.message : String(e)}`
              );
              process.exitCode = 1;
              return;
            }
            reporter.promptWritingCompleted(discoveryToolId);
            promptContent = generatedPrompt;
          }
        }
      }
      promptContent = withExecutionBoilerplate(promptContent);
      if (!slug) slug = generateSlug("loop");
      if (opts.dryRun) {
        const baseDir = opts.outputDir || config.defaults.outputDir;
        const dryOutputDir = join13(baseDir, slug);
        const invocations = buildDryRunInvocations(
          config,
          toolIds,
          promptContent,
          dryOutputDir,
          readOnlyPolicy,
          cwd
        );
        info(formatDryRun(invocations));
        const roundCount = rounds === Number.MAX_SAFE_INTEGER ? "unlimited" : String(rounds);
        const durStr = durationMs ? `, max duration: ${opts.duration}` : "";
        info(`  Rounds: ${roundCount}${durStr}`);
        if (preset) {
          info(`  Preset: ${preset.name}`);
        }
        info(`  Convergence threshold: ${convergenceThreshold}`);
        return;
      }
      const { outputDir, promptFilePath } = createOutputDir(
        opts,
        slug,
        promptContent,
        cwd,
        config
      );
      const promptLabel = getPromptLabel(promptArg, opts.file);
      const runStart = Date.now();
      const totalRoundsLabel = rounds === Number.MAX_SAFE_INTEGER ? null : rounds;
      reporter.executionStarted(outputDir, toolIds, { durationMs });
      try {
        const loopResult = await runLoop({
          config,
          toolIds,
          promptContent,
          promptFilePath,
          outputDir,
          readOnlyPolicy,
          cwd,
          rounds,
          durationMs,
          convergenceThreshold,
          onRoundStart: (round) => {
            reporter.roundStarted(round, totalRoundsLabel);
          },
          onProgress: (event) => {
            if (event.event === "started")
              reporter.toolStarted(event.toolId, event.pid);
            if (event.event === "completed")
              reporter.toolCompleted(event.toolId, event.report);
          },
          onConvergence: (round, ratio) => {
            reporter.convergenceDetected(round, ratio, convergenceThreshold);
          }
        });
        reporter.executionFinished();
        const allReports = loopResult.rounds.flatMap((r) => r.tools);
        const finalNotes = synthesizeFinal(loopResult.rounds, outputDir);
        safeWriteFile(resolve9(outputDir, "final-notes.md"), finalNotes);
        const manifest = {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          slug,
          prompt: promptLabel,
          promptSource,
          readOnlyPolicy,
          tools: allReports,
          rounds: loopResult.rounds,
          totalRounds: loopResult.rounds.length,
          durationMs: Date.now() - runStart,
          preset: preset?.name
        };
        safeWriteFile(
          resolve9(outputDir, "run.json"),
          JSON.stringify(manifest, null, 2)
        );
        reporter.printSummary(manifest, { json: opts.json });
      } catch (e) {
        reporter.executionFinished();
        throw e;
      }
    }
  );
}

// src/commands/make-dir.ts
function registerMakeDirCommand(program2) {
  program2.command("mkdir [prompt]").description(
    "Create an output directory and optionally write prompt.md without dispatching (supports prompt arg, -f, or stdin)"
  ).option("-f, --file <path>", "Use a pre-built prompt file (no wrapping)").option(
    "--context <paths>",
    'Gather context from paths (comma-separated, or "." for git diff)'
  ).option("-o, --output-dir <dir>", "Base output directory").option(
    "--json",
    "Output metadata as JSON (outputDir, promptFilePath, slug, promptSource). promptFilePath is null when no prompt is provided."
  ).action(
    async (promptArg, opts) => {
      const cwd = process.cwd();
      const globalConfig = loadConfig();
      const projectConfig = loadProjectConfig(cwd);
      const config = mergeConfigs(globalConfig, projectConfig);
      const hasExplicitPromptInput = Boolean(promptArg || opts.file);
      let prompt = hasExplicitPromptInput ? await resolvePrompt(promptArg, opts, cwd, config) : null;
      if (hasExplicitPromptInput && !prompt) return;
      if (!prompt && !process.stdin.isTTY) {
        const chunks = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        const stdinContent = Buffer.concat(chunks).toString("utf-8").trim();
        if (stdinContent) {
          const context = opts.context ? gatherContext(
            cwd,
            opts.context === "." ? [] : opts.context.split(","),
            config.defaults.maxContextKb
          ) : void 0;
          prompt = {
            promptContent: buildPrompt(stdinContent, context),
            promptSource: "stdin",
            slug: generateSlug(stdinContent)
          };
        }
      }
      if (!prompt) {
        const slug2 = generateSlug("manual-prompt");
        const baseDir = opts.outputDir || config.defaults.outputDir;
        const outputDir2 = resolveOutputDir(baseDir, slug2);
        if (opts.json) {
          info(
            JSON.stringify(
              {
                outputDir: outputDir2,
                promptFilePath: null,
                slug: slug2,
                promptSource: "none"
              },
              null,
              2
            )
          );
          return;
        }
        info(`Output directory: ${outputDir2}`);
        info("Prompt file: (not created)");
        info(`Slug: ${slug2}`);
        return;
      }
      const slug = prompt.slug || generateSlug("prompt");
      const { outputDir, promptFilePath } = createOutputDir(
        opts,
        slug,
        prompt.promptContent,
        cwd,
        config
      );
      if (opts.json) {
        info(
          JSON.stringify(
            {
              outputDir,
              promptFilePath,
              slug,
              promptSource: prompt.promptSource
            },
            null,
            2
          )
        );
        return;
      }
      info(`Output directory: ${outputDir}`);
      info(`Prompt file: ${promptFilePath}`);
      info(`Slug: ${slug}`);
    }
  );
}

// src/commands/run.ts
import { resolve as resolve10 } from "path";
function registerRunCommand(program2) {
  program2.command("run [prompt]").description("Dispatch prompt to configured AI tools in parallel").option("-f, --file <path>", "Use a pre-built prompt file (no wrapping)").option("-t, --tools <tools>", "Comma-separated list of tools to use").option(
    "-g, --group <groups>",
    "Comma-separated group name(s) to run (expands to tool IDs)"
  ).option(
    "--context <paths>",
    'Gather context from paths (comma-separated, or "." for git diff)'
  ).option("--read-only <level>", "Read-only policy: strict, best-effort, off").option("--dry-run", "Show what would be dispatched without running").option("--json", "Output manifest as JSON").option("-o, --output-dir <dir>", "Base output directory").action(
    async (promptArg, opts) => {
      const cwd = process.cwd();
      const resolved = await resolveTools(opts, cwd);
      if (!resolved) return;
      const { toolIds, config } = resolved;
      const readOnlyPolicy = resolveReadOnlyPolicy(opts.readOnly, config);
      if (!readOnlyPolicy) return;
      const prompt = await resolvePrompt(promptArg, opts, cwd, config);
      if (!prompt) return;
      let { promptContent, promptSource, slug } = prompt;
      if (!slug) slug = generateSlug("run");
      if (opts.dryRun) {
        const baseDir = opts.outputDir || config.defaults.outputDir;
        const dryOutputDir = resolve10(cwd, baseDir, slug);
        const invocations = buildDryRunInvocations(
          config,
          toolIds,
          promptContent,
          dryOutputDir,
          readOnlyPolicy,
          cwd
        );
        info(formatDryRun(invocations));
        return;
      }
      const { outputDir, promptFilePath } = createOutputDir(
        opts,
        slug,
        promptContent,
        cwd,
        config
      );
      const promptLabel = getPromptLabel(promptArg, opts.file);
      const reporter = createReporter();
      reporter.executionStarted(outputDir, toolIds);
      let reports;
      try {
        reports = await dispatch({
          config,
          toolIds,
          promptFilePath,
          promptContent,
          outputDir,
          readOnlyPolicy,
          cwd,
          onProgress: (event) => {
            if (event.event === "started")
              reporter.toolStarted(event.toolId, event.pid);
            if (event.event === "completed")
              reporter.toolCompleted(event.toolId, event.report);
          }
        });
      } finally {
        reporter.executionFinished();
      }
      const manifest = {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        slug,
        prompt: promptLabel,
        promptSource,
        readOnlyPolicy,
        tools: reports
      };
      safeWriteFile(
        resolve10(outputDir, "run.json"),
        JSON.stringify(manifest, null, 2)
      );
      const summary = synthesize(manifest, outputDir);
      safeWriteFile(resolve10(outputDir, "summary.md"), summary);
      reporter.printSummary(manifest, { json: opts.json });
    }
  );
}

// src/commands/skill.ts
function registerSkillCommand(program2) {
  program2.command("skill").description("Print a skill/slash-command template for coding agents").action(async () => {
    const template = `---
name: counselors
description: Get parallel second opinions from multiple AI coding agents. Use when the user wants independent reviews, architecture feedback, or a sanity check from other AI models.
---

# Counselors \u2014 Multi-Agent Review Skill

> **\u23F1 Long-running command.** Counselors dispatches to multiple external AI agents in parallel, each of which may take several minutes. Total wall time is commonly **10\u201320+ minutes**. Consider running the dispatch command (Phase 5) in the background and monitoring progress rather than blocking your main context. You can check on results periodically and proceed to Phase 6 once the process completes. Counselors is a well-behaved long-running process: it emits periodic heartbeat lines to stdout and prints each child process PID alongside the agent name, so you can verify agents are still running.

> **Note:** This is a reference skill template. Your agent system may use a different skill/command format. Adapt the structure and frontmatter below to match your system's conventions \u2014 the workflow and phases are what matter.

Fan out a prompt to multiple AI coding agents in parallel and synthesize their responses.

Use \`run\` for single-shot parallel review, or \`loop\` for iterative multi-round analysis.

Arguments: $ARGUMENTS

**If no arguments provided**, ask the user what they want reviewed.

---

## Phase 1: Context Gathering

Parse \`$ARGUMENTS\` to understand what the user wants reviewed. Then identify relevant context:

1. **Files mentioned in the prompt**: Use Glob/Grep to find files referenced by name, class, function, or keyword
2. **Recent changes**: Run \`git diff HEAD\` and \`git diff --staged\` to identify what changed
3. **Related code**: Search for key terms from the prompt to identify the most relevant files (up to 5 files)

**Important**: You do NOT need to read and inline every file. Subagents have access to the filesystem and git \u2014 they can read files and run git commands themselves. Your job is to *identify* the relevant files and reference them, not to copy their contents into the prompt. See Phase 4 for how to use \`@file\` references.

---

## Phase 2: Dispatch Mode Selection

Decide whether this request should use \`run\` or \`loop\`.

1. **Default to \`run\`** for a quick second-opinion pass.
2. **Use \`loop\`** when the user wants deeper iterative analysis, broad hunts, or multi-round convergence.
3. If using \`loop\`, choose one of two loop modes:
   - **Preset loop**: use \`--preset\` for domain workflows (bug, security, state, regression, API contracts, performance)
   - **Custom loop**: no preset; you write a full prompt file just like \`run\`, but dispatch with \`counselors loop\`
   - **Inline loop**: pass a short prompt string directly (no \`-f\`); counselors automatically runs discovery + prompt-writing phases to expand it into a full execution prompt. Use \`--no-inline-enhancement\` to skip this and send the raw prompt as-is.

If the user says "use a preset" or names one, run:
\`\`\`bash
counselors loop --list-presets
\`\`\`
Print the output and have them pick a preset.

---

## Phase 3: Agent Selection

1. **Discover available agents and groups** by running via Bash:
   \`\`\`bash
   counselors ls
   counselors groups ls
   \`\`\`
   The first command lists all configured agents with their IDs and binaries. The second lists any configured **groups** (predefined sets of tool IDs).

2. **MANDATORY: Print the full agent list and group list, then ask the user which to use.**

   **Always print the full \`counselors ls\` output and \`counselors groups ls\` output as inline text** (not inside AskUserQuestion). Just show the raw output so the user sees every tool/group. Do NOT reformat or abbreviate it.

   Then ask the user to pick:

   **If 4 or fewer agents**: Use AskUserQuestion with \`multiSelect: true\`, one option per agent.

   **If more than 4 agents**: AskUserQuestion only supports 4 options. Use these fixed options:
   - Option 1: "All [N] agents" \u2014 sends to every configured agent
	   - Option 2-4: The first 3 individual agents by ID
	   - The user can always select "Other" to type a comma-separated list of agent IDs from the printed list above

	   If groups exist, you MAY offer group options (e.g. "Group: smart"), but you MUST expand them to the underlying tool IDs and confirm that expanded list with the user before dispatch. This avoids silently omitting or adding agents.
	   If the user says something like "use the smart group", you MUST look up that group in the configured groups list (\`counselors groups ls\`). If it exists, use it (via \`--group smart\` or by expanding to tool IDs) and confirm the expanded tool list before dispatch. If it does not exist, tell the user and ask them to choose again \u2014 do not guess.

	3. Wait for the user's selection before proceeding.

4. **MANDATORY: Confirm the selection before continuing.** After the user picks agents, echo back the exact list you will dispatch to:

   > Dispatching to: **claude-opus**, **codex-5.3-high**, **gemini-pro**

   Then ask the user to confirm (e.g. "Look good?") before proceeding to Phase 4. This prevents silent tool omissions. If the user corrects the list, update your selection accordingly.

5. **Discovery tool (loop only)**: By default, the first tool in your selection runs the discovery and prompt-writing prep phases. To use a different agent for these phases, pass \`--discovery-tool <id>\`.

---

## Phase 4: Prompt Assembly

For \`run\` and custom \`loop\` (file-based) modes, assemble the review prompt content.
For preset loop mode and inline loop mode, skip this phase \u2014 counselors handles prompt generation automatically via discovery + prompt-writing phases (see Phase 5).

**Note:** Counselors automatically appends execution boilerplate (general guidelines about focusing on source dirs, skipping vendor/binary files, providing file paths for findings) to every prompt before dispatch. You do not need to include these instructions yourself.

   **Subagents can read files and use git.** You do NOT need to inline file contents or diff output into the prompt. Instead, use \`@path/to/file\` references to point subagents at the relevant files. They will read the files themselves. This keeps the prompt concise and avoids bloating it with copied code.

   Only inline small, critical snippets if they're essential for framing the question (e.g. a specific function signature or error message). For everything else, use \`@file\` references.

\`\`\`markdown
# Review Request

## Question
[User's original prompt/question from $ARGUMENTS]

## Context

### Files to Review
[List @path/to/file references for each relevant file found in Phase 1]
[e.g. @src/core/executor.ts, @src/adapters/claude.ts]

### Recent Changes
[Brief description of what changed. If a diff is relevant, tell the agent to run \`git diff HEAD\` themselves, or inline only a small critical snippet]

### Related Code
[@path/to/file references for related files discovered via search]

## Instructions
You are providing an independent review. Be critical and thorough.
- Read the referenced files to understand the full context
- Analyze the question in the context provided
- Identify risks, tradeoffs, and blind spots
- Suggest alternatives if you see better approaches
- Be direct and opinionated \u2014 don't hedge
- Structure your response with clear headings
\`\`\`

---

## Phase 5: Dispatch

Dispatch based on the selected mode.

### Mode A: \`run\` (single-shot)

First, create the output directory + \`prompt.md\` via counselors itself by piping your assembled prompt content:

\`\`\`bash
cat <<'PROMPT' | counselors mkdir --json
[assembled prompt content from Phase 4]
PROMPT
\`\`\`

Parse the JSON output and read \`promptFilePath\`, then dispatch with that path:

\`\`\`bash
counselors run -f <promptFilePath> --tools [comma-separated-tool-ids] --json
\`\`\`

Examples:
- \`--tools claude,codex,gemini\`
- \`--group smart\` (uses the configured group)
- \`--group smart --tools codex\` (group plus explicit tools)

### Mode B: \`loop\` + custom prompt file (iterative, no preset)

As with Mode A, first create \`prompt.md\` via \`counselors mkdir --json\`, then run:

\`\`\`bash
counselors loop -f <promptFilePath> --tools [comma-separated-tool-ids] --json
\`\`\`

Using \`-f\` skips the discovery/prompt-writing phases and sends the prompt as-is. You may add these optional flags:
- \`--rounds <N>\` \u2014 number of rounds (default: 3)
- \`--duration <time>\` \u2014 max wall time (e.g. \`30m\`, \`1h\`); when set without explicit \`--rounds\`, rounds are unlimited
- \`--convergence-threshold <ratio>\` \u2014 early stop when output word count drops below this ratio of the previous round (default: 0.3)

### Mode C: \`loop\` + inline prompt (iterative, no preset, auto-enhanced)

Pass a short prompt string directly. Counselors automatically runs two prep phases before dispatch:
1. **Discovery** \u2014 the discovery tool scans the repo to gather structural context
2. **Prompt writing** \u2014 the discovery tool expands your short input into a full execution prompt grounded in the discovered context

\`\`\`bash
counselors loop "find race conditions in the worker pool" --tools [comma-separated-tool-ids] --json
\`\`\`

To skip the automatic enhancement and send the raw prompt: add \`--no-inline-enhancement\`.

### Mode D: \`loop\` + preset (iterative, preset-driven)

For preset mode, do NOT write a full prompt file. Pass a concise focus string instead. The preset provides domain-specific instructions, and counselors runs the same discovery + prompt-writing phases as inline mode.

\`\`\`bash
counselors loop --preset <preset-name> "<focus area>" --tools [comma-separated-tool-ids] --json
\`\`\`

Example:
- \`counselors loop --preset hotspots "critical request path" --group smart --duration 20m --json\`

### Loop behavior: prior-round enrichment

In rounds 2+, counselors automatically augments the prompt with \`@file\` references to all prior round outputs. Agents receive explicit instructions to:
- Not repeat findings unless adding new evidence
- Challenge and refine prior claims
- Follow adjacent code paths discovered in earlier rounds
- Label overlapping findings as confirmed, refined, invalidated, or duplicate

### Common flags for all loop modes

| Flag | Description |
|------|-------------|
| \`--rounds <N>\` | Number of rounds (default: 3) |
| \`--duration <time>\` | Max wall time (\`30m\`, \`1h\`); unlimited rounds when set alone |
| \`--convergence-threshold <ratio>\` | Early stop ratio (default: 0.3) |
| \`--discovery-tool <id>\` | Agent for prep phases (default: first tool) |
| \`--no-inline-enhancement\` | Skip discovery/prompt-writing for inline prompts |

Use \`timeout: 600000\` (10 minutes) or higher. Counselors dispatches to the selected agents in parallel and writes results to the output directory shown in the JSON output.

**Important**: For run/custom-loop file mode, use \`-f\` so the prompt is sent as-is without wrapping. Use \`--json\` on both \`mkdir\` and dispatch commands to get structured output for parsing.

**Timing**: Sessions commonly take more than 10 minutes. Counselors prints each child process PID alongside the agent name in its progress output (e.g. \`PID 12345  claude\`). If a run seems stuck, you can verify processes are still alive with \`ps -p <PID>\` (macOS/Linux) or \`tasklist /FI "PID eq <PID>"\` (Windows).

---

## Phase 6: Read Results

1. **Parse the JSON output** from stdout \u2014 it contains the run manifest with status, duration, word count, and output file paths for each agent
2. **Read each agent's response** from the \`outputFile\` path in the manifest
3. **Check \`stderrFile\` paths** for any agent that failed or returned empty output
4. **Skip empty or error-only reports** \u2014 note which agents failed

### Loop output structure

For \`loop\` runs, the output directory contains per-round subdirectories plus cross-round notes:

\`\`\`
{outputDir}/
\u251C\u2500\u2500 round-1/
\u2502   \u251C\u2500\u2500 prompt.md          # Input prompt for this round
\u2502   \u251C\u2500\u2500 {tool-id}.md       # Each agent's output
\u2502   \u2514\u2500\u2500 round-notes.md     # Per-round summary (auto-generated)
\u251C\u2500\u2500 round-2/
\u2502   \u251C\u2500\u2500 prompt.md          # Base prompt + @file refs to round-1 outputs
\u2502   \u251C\u2500\u2500 {tool-id}.md
\u2502   \u2514\u2500\u2500 round-notes.md
\u251C\u2500\u2500 final-notes.md         # Cross-round summary (auto-generated)
\u2514\u2500\u2500 run.json               # Structured manifest with all rounds
\`\`\`

The manifest's \`rounds\` array contains per-round tool reports. \`totalRounds\` and \`durationMs\` are at the top level. Start with \`final-notes.md\` for a high-level summary, then drill into individual round outputs as needed.

---

## Phase 7: Synthesize and Present

Combine all agent responses into a synthesis:

\`\`\`markdown
## Counselors Review

**Agents consulted:** [list of agents that responded]

**Consensus:** [What most agents agree on \u2014 key takeaways]

**Disagreements:** [Where they differ, and reasoning behind each position]

**Key Risks:** [Risks or concerns flagged by any agent]

**Blind Spots:** [Things none of the agents addressed that seem important]

**Recommendation:** [Your synthesized recommendation based on all inputs]

---
Reports saved to: [output directory from manifest]
\`\`\`

Present this synthesis to the user. Be concise \u2014 the individual reports are saved for deep reading.

---

## Phase 8: Action (Optional)

After presenting the synthesis, ask the user what they'd like to address. Offer the top 2-3 actionable items from the synthesis as options. If the user wants to act on findings, plan the implementation before making changes.

---

## Error Handling

- **counselors not installed**: Tell the user to install it (\`npm install -g counselors\`)
- **No tools configured**: Tell the user to run \`counselors init\` or \`counselors tools add <tool>\`
- **Agent fails**: Note it in the synthesis and continue with other agents' results
- **All agents fail**: Report errors from stderr files and suggest checking \`counselors doctor\`
`;
    info(template);
  });
}

// src/commands/tools/add.ts
import { accessSync as accessSync3, constants as constants3 } from "fs";
import { resolve as resolve11 } from "path";
var CUSTOM_TOOL_VALUE = "__custom__";
async function runAddWizard() {
  const spinner = createSpinner("Discovering installed tools...").start();
  const adapters = getAllBuiltInAdapters();
  const discovered = [];
  for (const adapter of adapters) {
    const result = discoverTool(adapter.commands);
    discovered.push({
      id: adapter.id,
      name: adapter.displayName,
      found: result.found,
      version: result.version
    });
  }
  spinner.stop();
  const choices = discovered.map((d) => ({
    name: d.found ? `${d.name} (${d.id})${d.version ? ` \u2014 ${d.version}` : ""}` : `${d.name} (${d.id}) \u2014 not installed`,
    value: d.id,
    disabled: !d.found ? "(not installed)" : void 0
  }));
  choices.push({
    name: "Custom tool \u2014 provide a binary path",
    value: CUSTOM_TOOL_VALUE,
    disabled: void 0
  });
  const selected = await promptSelect(
    "Which tool would you like to add?",
    choices
  );
  if (selected === CUSTOM_TOOL_VALUE) {
    return { toolId: "", isCustom: true };
  }
  return { toolId: selected, isCustom: false };
}
function validateBinary(input2) {
  const resolved = resolve11(input2);
  try {
    accessSync3(resolved, constants3.X_OK);
    return resolved;
  } catch {
  }
  const found = findBinary(input2);
  if (found) return found;
  return null;
}
async function addBuiltInTool(toolId, config, nameOverride) {
  const adapter = getAdapter(toolId);
  const discovery = discoverTool(adapter.commands);
  if (!discovery.found) {
    error(
      `"${toolId}" binary not found. Install it from: ${adapter.installUrl}`
    );
    process.exitCode = 1;
    return;
  }
  const selectedModel = await selectModelDetails(toolId, adapter.models);
  let extraFlags;
  let defaultName;
  if (selectedModel.id === "__custom__") {
    const modelId = await promptInput("Model identifier:");
    if (!modelId.trim()) {
      error("No model identifier provided.");
      process.exitCode = 1;
      return;
    }
    const extraInput = await promptInput(
      "Extra flags (optional, space-separated):"
    );
    const parsedExtra = extraInput.trim() ? extraInput.trim().split(/\s+/) : [];
    extraFlags = [adapter.modelFlag ?? "-m", modelId.trim(), ...parsedExtra];
    defaultName = nameOverride ?? `${toolId}-${sanitizeId(modelId.trim())}`;
  } else {
    extraFlags = selectedModel.extraFlags;
    const fallbackName = selectedModel.id.startsWith(`${toolId}-`) ? selectedModel.id : `${toolId}-${selectedModel.id}`;
    defaultName = nameOverride ?? selectedModel.compoundId ?? fallbackName;
  }
  let name = nameOverride ?? await promptInput("Tool name:", defaultName);
  if (!SAFE_ID_RE.test(name)) {
    error(
      `Invalid tool name "${name}". Use only letters, numbers, dots, hyphens, and underscores.`
    );
    process.exitCode = 1;
    return;
  }
  if (config.tools[name]) {
    const overwrite = await confirmOverwrite(name);
    if (!overwrite) {
      name = await promptInput("Pick a different name:");
      if (!SAFE_ID_RE.test(name)) {
        error(
          `Invalid tool name "${name}". Use only letters, numbers, dots, hyphens, and underscores.`
        );
        process.exitCode = 1;
        return;
      }
      if (config.tools[name]) {
        error(`"${name}" also exists. Run "counselors tools add" again.`);
        process.exitCode = 1;
        return;
      }
    }
  }
  const toolConfig = {
    binary: discovery.path,
    readOnly: { level: adapter.readOnly.level },
    adapter: toolId,
    ...extraFlags ? { extraFlags } : {}
  };
  const updated = addToolToConfig(config, name, toolConfig);
  saveConfig(updated);
  if (toolId === "amp") {
    copyAmpSettings();
  }
  success(`Added "${name}" to config.`);
  if (selectedModel.id === "__custom__") {
    info("Testing tool configuration...");
    const testAdapter = resolveAdapter(name, toolConfig);
    const result = await executeTest(testAdapter, toolConfig, name);
    info(formatTestResults([result]));
    if (!result.passed) {
      warn(
        "The tool was saved to your config but the test failed. You may need to check your API access or flags."
      );
    }
  }
}
async function collectCustomConfig(config, presetId) {
  let binaryPath = null;
  while (!binaryPath) {
    const binaryInput = await promptInput("Binary path or command:");
    binaryPath = validateBinary(binaryInput);
    if (!binaryPath) {
      warn(`"${binaryInput}" not found or not executable. Please try again.`);
    }
  }
  const useStdin = await confirmAction(
    "Does this tool receive prompts via stdin?"
  );
  info("");
  info("  Counselors runs tools non-interactively. Your flags MUST include:");
  info(
    "    1. Headless/non-interactive mode (e.g. -p, --non-interactive, --headless)"
  );
  info("    2. Model selection if needed (e.g. --model gpt-4o)");
  info("    3. Output format if needed (e.g. --output-format text)");
  info("");
  if (!useStdin) {
    info("  Counselors will append the prompt as the last CLI argument:");
    info(
      '    "Read the file at <path> and follow the instructions within it."'
    );
  } else {
    info("  Counselors will pipe the prompt text to stdin.");
  }
  info("");
  info("  Example: -p --model gpt-4o --output-format text");
  info("");
  let extraFlags;
  const flagsInput = await promptInput("Flags (space-separated):");
  if (flagsInput.trim()) {
    extraFlags = flagsInput.trim().split(/\s+/);
  }
  const readOnlyLevel = await promptSelect(
    "Read-only capability:",
    [
      { name: "Enforced \u2014 tool guarantees read-only", value: "enforced" },
      {
        name: "Best effort \u2014 tool tries but may not guarantee",
        value: "bestEffort"
      },
      { name: "None \u2014 tool has full access", value: "none" }
    ]
  );
  const defaultId = presetId ?? binaryPath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "custom";
  const toolId = await promptInput(
    "Tool name (used in config and output filenames):",
    defaultId
  );
  if (!SAFE_ID_RE.test(toolId)) {
    error(
      `Invalid tool name "${toolId}". Use only letters, numbers, dots, hyphens, and underscores.`
    );
    process.exitCode = 1;
    return;
  }
  info("");
  info("  Tool will be invoked as:");
  const previewArgs = [
    ...extraFlags ?? [],
    useStdin ? "< prompt.md" : '"Read the file at <path> and follow the instructions..."'
  ];
  info(`    ${binaryPath} ${previewArgs.join(" ")}`);
  info("");
  if (config.tools[toolId]) {
    const overwrite = await confirmOverwrite(toolId);
    if (!overwrite) {
      const newId = await promptInput("Pick a different name:");
      if (!SAFE_ID_RE.test(newId)) {
        error(
          `Invalid tool name "${newId}". Use only letters, numbers, dots, hyphens, and underscores.`
        );
        process.exitCode = 1;
        return;
      }
      if (config.tools[newId]) {
        error(`"${newId}" also exists. Run "counselors tools add" again.`);
        process.exitCode = 1;
        return;
      }
      const toolConfig2 = {
        binary: binaryPath,
        readOnly: { level: readOnlyLevel },
        ...useStdin ? { stdin: true } : {},
        extraFlags,
        custom: true
      };
      const updated2 = addToolToConfig(config, newId, toolConfig2);
      saveConfig(updated2);
      success(`Added "${newId}" to config.`);
      return;
    }
  }
  const toolConfig = {
    binary: binaryPath,
    readOnly: { level: readOnlyLevel },
    ...useStdin ? { stdin: true } : {},
    extraFlags,
    custom: true
  };
  const updated = addToolToConfig(config, toolId, toolConfig);
  saveConfig(updated);
  success(`Added "${toolId}" to config.`);
}
function registerAddCommand(program2) {
  program2.command("add [tool]").description(
    "Add a tool (claude, codex, gemini, amp, openrouter, or custom)"
  ).action(async (toolId) => {
    const config = loadConfig();
    if (!toolId) {
      const result = await runAddWizard();
      if (result.isCustom) {
        await collectCustomConfig(config);
      } else {
        await addBuiltInTool(result.toolId, config);
      }
      return;
    }
    if (isBuiltInTool(toolId)) {
      await addBuiltInTool(toolId, config);
    } else {
      await collectCustomConfig(config, toolId);
    }
  });
}

// src/commands/tools/discover.ts
function registerDiscoverCommand(program2) {
  program2.command("discover").description("Discover installed AI CLI tools").action(async () => {
    const spinner = createSpinner("Scanning for AI CLI tools...").start();
    const adapters = getAllBuiltInAdapters();
    const results = [];
    for (const adapter of adapters) {
      const result = discoverTool(adapter.commands);
      results.push({
        ...result,
        toolId: adapter.id,
        displayName: adapter.displayName
      });
    }
    spinner.stop();
    info(formatDiscoveryResults(results));
  });
}

// src/commands/tools/list.ts
function registerListCommand(program2) {
  program2.command("list").alias("ls").description("List configured tools").option("-v, --verbose", "Show full tool configuration including flags").action(async (opts) => {
    const config = loadConfig();
    const tools2 = Object.entries(config.tools).map(([id, t]) => {
      const entry = {
        id,
        binary: t.binary
      };
      if (opts.verbose) {
        const adapter = resolveAdapter(id, t);
        const inv = adapter.buildInvocation({
          prompt: "<prompt>",
          promptFilePath: "<prompt-file>",
          toolId: id,
          outputDir: ".",
          readOnlyPolicy: t.readOnly.level,
          timeout: t.timeout ?? config.defaults.timeout,
          cwd: process.cwd(),
          binary: t.binary,
          extraFlags: t.extraFlags
        });
        entry.args = inv.args;
      }
      return entry;
    });
    info(formatToolList(tools2, opts.verbose));
  });
}

// src/commands/tools/remove.ts
import { checkbox as checkbox2 } from "@inquirer/prompts";
function registerRemoveCommand(program2) {
  program2.command("remove [tool]").description("Remove a configured tool").action(async (toolId) => {
    const config = loadConfig();
    const toolIds = Object.keys(config.tools);
    if (toolIds.length === 0) {
      error("No tools configured.");
      process.exitCode = 1;
      return;
    }
    let toRemove;
    if (toolId) {
      if (!config.tools[toolId]) {
        error(`Tool "${toolId}" is not configured.`);
        process.exitCode = 1;
        return;
      }
      toRemove = [toolId];
    } else {
      toRemove = await checkbox2({
        message: "Select tools to remove:",
        choices: toolIds.map((id) => ({
          name: `${id} (${config.tools[id].binary})`,
          value: id
        }))
      });
      if (toRemove.length === 0) {
        info("No tools selected.");
        return;
      }
    }
    const confirmed = await confirmAction(
      toRemove.length === 1 ? `Remove "${toRemove[0]}" from config?` : `Remove ${toRemove.length} tools from config?`
    );
    if (!confirmed) return;
    let updated = config;
    for (const id of toRemove) {
      updated = removeToolFromConfig(updated, id);
    }
    saveConfig(updated);
    success(`Removed ${toRemove.join(", ")}.`);
  });
}

// src/commands/tools/rename.ts
function registerRenameCommand(program2) {
  program2.command("rename <old> <new>").description("Rename a configured tool").action(async (oldId, newId) => {
    const config = loadConfig();
    if (!config.tools[oldId]) {
      error(`Tool "${oldId}" is not configured.`);
      process.exitCode = 1;
      return;
    }
    if (config.tools[newId]) {
      error(`Tool "${newId}" already exists.`);
      process.exitCode = 1;
      return;
    }
    if (!SAFE_ID_RE.test(newId)) {
      error(
        `Invalid tool name "${newId}". Use only letters, numbers, dots, hyphens, and underscores.`
      );
      process.exitCode = 1;
      return;
    }
    const updated = renameToolInConfig(config, oldId, newId);
    saveConfig(updated);
    success(`Renamed "${oldId}" \u2192 "${newId}".`);
  });
}

// src/commands/tools/test.ts
function registerTestCommand(program2) {
  program2.command("test [tools...]").description('Test configured tools with a "reply OK" prompt').action(async (toolIds) => {
    const config = loadConfig();
    const idsToTest = toolIds.length > 0 ? toolIds : Object.keys(config.tools);
    if (idsToTest.length === 0) {
      error('No tools configured. Run "counselors init" first.');
      process.exitCode = 1;
      return;
    }
    const results = [];
    for (const id of idsToTest) {
      const toolConfig = config.tools[id];
      if (!toolConfig) {
        results.push({
          toolId: id,
          passed: false,
          output: "",
          error: "Not configured",
          durationMs: 0
        });
        continue;
      }
      const spinner = createSpinner(`Testing ${id}...`).start();
      const adapter = resolveAdapter(id, toolConfig);
      const result = await executeTest(adapter, toolConfig, id);
      spinner.stop();
      results.push(result);
    }
    info(formatTestResults(results));
    if (results.some((r) => !r.passed)) {
      process.exitCode = 1;
    }
  });
}

// src/commands/upgrade.ts
var METHOD_LABEL = {
  homebrew: "Homebrew",
  npm: "npm (global)",
  pnpm: "pnpm (global)",
  yarn: "yarn (global)",
  standalone: "Standalone binary",
  unknown: "Unknown"
};
var INSTALL_SCRIPT = "curl -fsSL https://github.com/aarondfrancis/counselors/raw/main/install.sh | bash";
var MANUAL_UPGRADE_OPTIONS = [
  "brew upgrade counselors",
  "npm install -g counselors@latest",
  "pnpm add -g counselors@latest",
  "yarn global add counselors@latest",
  INSTALL_SCRIPT
];
var FORCE_NOTE = "If this is a standalone install in a non-standard location, re-run with --force.";
var SKILL_TEMPLATE_HISTORY_URL = "https://github.com/aarondfrancis/counselors/commits/main/src/commands/skill.ts";
function printSkillUpdateGuidance() {
  info("");
  info(
    "The skill template might have changed. Copy and paste this into your LLM:"
  );
  info("");
  info("The counselors CLI has an updated skill template.");
  info("");
  info("1. Run `counselors skill` and capture the full output.");
  info(
    "2. Open my existing counselors skill file and compare VERY CAREFULLY for anything that changed."
  );
  info("3. Apply the updates manually; do not blindly overwrite.");
  info(
    "4. If you need more context, check the git history for the skill template here:"
  );
  info(`   ${SKILL_TEMPLATE_HISTORY_URL}`);
}
function printManualUpgradeGuidance() {
  warn("Try one of:");
  for (const option of MANUAL_UPGRADE_OPTIONS) {
    warn(`  ${option}`);
  }
}
function registerUpgradeCommand(program2) {
  program2.command("upgrade").description("Detect install method and upgrade counselors when possible").option("--check", "Only show install method/version details").option("--dry-run", "Show what would be done without upgrading").option("--force", "Force standalone self-upgrade outside safe locations").action(
    async (opts) => {
      const detection = detectInstallation();
      info("");
      info(
        `Install method: ${METHOD_LABEL[detection.method] ?? detection.method}`
      );
      info(`Running version: ${VERSION}`);
      if (detection.installedVersion) {
        info(`Installed version: ${detection.installedVersion}`);
      }
      if (detection.binaryPath) {
        info(`Binary path: ${detection.binaryPath}`);
      }
      info("");
      if (opts.check) return;
      const effective = detection.method === "unknown" && opts.force && detection.binaryPath ? { ...detection, method: "standalone" } : detection;
      if (opts.dryRun) {
        info("Dry run \u2014 no changes will be made.");
        if (detection.method === "unknown" && !opts.force) {
          info(
            "Install method is unknown; would not run an automatic upgrade."
          );
          printManualUpgradeGuidance();
          warn(FORCE_NOTE);
          return;
        }
        if (effective.method === "standalone") {
          const assetName = getStandaloneAssetName();
          const targetPath = effective.resolvedBinaryPath ?? effective.binaryPath ?? "(unknown)";
          info(`Would self-upgrade standalone binary at: ${targetPath}`);
          if (assetName) {
            info(`Would download: ${assetName} and ${assetName}.sha256`);
          }
        } else {
          info(`Would run: ${effective.upgradeCommand ?? "(unknown)"}`);
        }
        return;
      }
      if (detection.method === "unknown" && !opts.force) {
        error(
          "Could not detect a supported install method for auto-upgrades."
        );
        if (detection.binaryPath) {
          warn(`Detected counselors binary at: ${detection.binaryPath}`);
        }
        printManualUpgradeGuidance();
        warn("");
        warn(FORCE_NOTE);
        process.exitCode = 1;
        return;
      }
      info(
        `Upgrading via ${METHOD_LABEL[effective.method] ?? effective.method}...`
      );
      const result = await performUpgrade(effective, { force: opts.force });
      if (!result.ok) {
        error(result.message);
        process.exitCode = 1;
        return;
      }
      success(result.message);
      const refreshed = detectInstallation();
      if (refreshed.installedVersion) {
        info(`Detected version after upgrade: ${refreshed.installedVersion}`);
      } else {
        warn('Upgrade completed. Re-run "counselors --version" to verify.');
      }
      printSkillUpdateGuidance();
    }
  );
}

// src/cli.ts
var program = new Command();
program.name("counselors").description(
  "Fan out prompts to multiple AI coding tools (agents) in parallel"
).version(VERSION);
registerRunCommand(program);
registerLoopCommand(program);
registerMakeDirCommand(program);
registerCleanupCommand(program);
registerConfigCommand(program);
registerDoctorCommand(program);
registerInitCommand(program);
registerAgentCommand(program);
registerSkillCommand(program);
registerUpgradeCommand(program);
var tools = program.command("tools").description("Manage AI tool configurations");
registerDiscoverCommand(tools);
registerAddCommand(tools);
registerRemoveCommand(tools);
registerRenameCommand(tools);
registerListCommand(tools);
registerTestCommand(tools);
var groups = program.command("groups").description("Manage predefined tool groups");
registerGroupListCommand(groups);
registerGroupAddCommand(groups);
registerGroupRemoveCommand(groups);
program.command("add [tool]").description('Alias for "tools add"').action(async (tool) => {
  const args = tool ? ["add", tool] : ["add"];
  await tools.parseAsync(args, { from: "user" });
});
program.command("ls").description('Alias for "tools list"').option("-v, --verbose", "Show full tool configuration including flags").action(async (opts) => {
  const args = ["list"];
  if (opts.verbose) args.push("--verbose");
  await tools.parseAsync(args, { from: "user" });
});
program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`\u2717 ${err.message}
`);
  process.exitCode = 1;
});
//# sourceMappingURL=cli.js.map