import { copyFileSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { isBuiltInTool, resolveAdapter } from '../adapters/index.js';
import { loadConfig, loadProjectConfig, mergeConfigs } from '../core/config.js';
import { gatherContext } from '../core/context.js';
import { safeWriteFile } from '../core/fs-utils.js';
import {
  buildPrompt,
  generateSlug,
  generateSlugFromFile,
  resolveOutputDir,
} from '../core/prompt-builder.js';
import type { Config, ReadOnlyLevel } from '../types.js';
import { error } from '../ui/logger.js';
import { selectRunTools } from '../ui/prompts.js';

// ── Duplicate tool expansion ──

/**
 * Handle repeated tool IDs (e.g. `--tools claude,claude,claude`).
 * First occurrence keeps its original ID. Subsequent occurrences get
 * suffixed clones (`claude__2`, `claude__3`) with duplicated config entries.
 */
export function expandDuplicateToolIds(
  toolIds: string[],
  config: Config,
): { toolIds: string[]; config: Config } {
  const used = new Set(Object.keys(config.tools));
  const nextSuffix: Record<string, number> = {};
  let expandedTools: Config['tools'] | null = null;

  const expanded: string[] = [];
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
    // Base tool existence is validated earlier; this is a defensive fallback.
    if (baseConfig) {
      const needsAdapter = !baseConfig.adapter && isBuiltInTool(id);
      expandedTools[candidate] = needsAdapter
        ? { ...baseConfig, adapter: id }
        : baseConfig;
    }

    used.add(candidate);
    expanded.push(candidate);
  }

  if (!expandedTools) return { toolIds, config };
  return { toolIds: expanded, config: { ...config, tools: expandedTools } };
}

// ── Tool resolution ──

export interface ToolOpts {
  tools?: string;
  group?: string;
  dryRun?: boolean;
}

export interface ResolvedTools {
  toolIds: string[];
  config: Config;
}

export async function resolveTools(
  opts: ToolOpts,
  cwd: string,
): Promise<ResolvedTools | null> {
  const globalConfig = loadConfig();
  const projectConfig = loadProjectConfig(cwd);
  let config = mergeConfigs(globalConfig, projectConfig);

  const groupNames = opts.group
    ? opts.group
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean)
    : [];
  const explicitSelection = Boolean(opts.tools || groupNames.length > 0);

  const groupToolIds: string[] = [];
  if (groupNames.length > 0) {
    for (const groupName of groupNames) {
      const ids = config.groups[groupName];
      if (!ids) {
        error(
          `Group "${groupName}" is not configured. Run "counselors groups list".`,
        );
        process.exitCode = 1;
        return null;
      }

      for (const id of ids) {
        if (!config.tools[id]) {
          error(
            `Group "${groupName}" references tool "${id}", but it is not configured.`,
          );
          process.exitCode = 1;
          return null;
        }
      }

      groupToolIds.push(...ids);
    }
  }

  const explicitToolIds = opts.tools
    ? opts.tools
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  let toolIds: string[];
  if (explicitSelection) {
    // Dedup tools that appear in both --group and --tools to avoid running twice.
    // Preserve intentional duplicates within --tools (handled by expandDuplicateToolIds).
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
      error('No tools selected.');
    }
    process.exitCode = 1;
    return null;
  }

  // Validate all tools exist in config
  for (const id of toolIds) {
    if (!config.tools[id]) {
      error(`Tool "${id}" not configured. Run "counselors tools add ${id}".`);
      process.exitCode = 1;
      return null;
    }
  }

  // Interactive tool selection when no --tools flag and TTY
  if (
    !explicitSelection &&
    !opts.dryRun &&
    process.stderr.isTTY &&
    toolIds.length > 1
  ) {
    const selected = await selectRunTools(toolIds);
    if (selected.length === 0) {
      error('No tools selected.');
      process.exitCode = 1;
      return null;
    }
    toolIds = selected;
  }

  // Expand duplicates (e.g. --tools claude,claude,claude)
  const expanded = expandDuplicateToolIds(toolIds, config);
  toolIds = expanded.toolIds;
  config = expanded.config;

  return { toolIds, config };
}

// ── Read-only policy resolution ──

/**
 * Map CLI flag values (strict / best-effort / off) to internal
 * ReadOnlyLevel values (enforced / bestEffort / none), falling
 * back to the config default when no flag is provided.
 */
const READ_ONLY_MAP: [cli: string, internal: ReadOnlyLevel][] = [
  ['strict', 'enforced'],
  ['best-effort', 'bestEffort'],
  ['off', 'none'],
];
const cliToInternal = new Map(READ_ONLY_MAP.map(([c, i]) => [c, i]));
const internalToCli = new Map(READ_ONLY_MAP.map(([c, i]) => [i, c]));

export function resolveReadOnlyPolicy(
  readOnlyInput: string | undefined,
  config: Config,
): ReadOnlyLevel | null {
  const input =
    readOnlyInput ??
    internalToCli.get(config.defaults.readOnly) ??
    'best-effort';
  const policy = cliToInternal.get(input);
  if (!policy) {
    error(
      `Invalid --read-only value "${input}". Must be: strict, best-effort, or off.`,
    );
    process.exitCode = 1;
    return null;
  }
  return policy;
}

// ── Prompt resolution ──

export interface PromptOpts {
  file?: string;
  context?: string;
  enrichStdinPrompt?: boolean;
}

export interface ResolvedPrompt {
  promptContent: string;
  promptSource: 'inline' | 'file' | 'stdin';
  slug: string;
}

export async function resolvePrompt(
  promptArg: string | undefined,
  opts: PromptOpts,
  cwd: string,
  config: Config,
): Promise<ResolvedPrompt | null> {
  if (opts.file) {
    const filePath = resolve(cwd, opts.file);
    let promptContent: string;
    try {
      promptContent = readFileSync(filePath, 'utf-8');
    } catch {
      error(`Cannot read prompt file: ${filePath}`);
      process.exitCode = 1;
      return null;
    }
    if (opts.context) {
      const context = gatherContext(
        cwd,
        opts.context === '.' ? [] : opts.context.split(','),
        config.defaults.maxContextKb,
      );
      if (context) promptContent = `${promptContent}\n\n${context}`;
    }
    return {
      promptContent,
      promptSource: 'file',
      slug: generateSlugFromFile(filePath),
    };
  }

  if (promptArg) {
    const context = opts.context
      ? gatherContext(
          cwd,
          opts.context === '.' ? [] : opts.context.split(','),
          config.defaults.maxContextKb,
        )
      : undefined;
    return {
      promptContent: buildPrompt(promptArg, context),
      promptSource: 'inline',
      slug: generateSlug(promptArg),
    };
  }

  // Check stdin
  if (process.stdin.isTTY) {
    error(
      'No prompt provided. Pass as argument, use -f <file>, or pipe via stdin.',
    );
    process.exitCode = 1;
    return null;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const stdinContent = Buffer.concat(chunks).toString('utf-8').trim();
  if (!stdinContent) {
    error('Empty prompt from stdin.');
    process.exitCode = 1;
    return null;
  }

  const context = opts.context
    ? gatherContext(
        cwd,
        opts.context === '.' ? [] : opts.context.split(','),
        config.defaults.maxContextKb,
      )
    : undefined;

  const enrichStdinPrompt = opts.enrichStdinPrompt ?? true;
  return {
    promptContent: enrichStdinPrompt
      ? buildPrompt(stdinContent, context)
      : context
        ? `${stdinContent}\n\n${context}`
        : stdinContent,
    promptSource: 'stdin',
    slug: generateSlug(stdinContent),
  };
}

// ── Output directory creation ──

export interface OutputDirResult {
  outputDir: string;
  promptFilePath: string;
}

export function createOutputDir(
  opts: { file?: string; outputDir?: string },
  slug: string,
  promptContent: string,
  cwd: string,
  config: Config,
): OutputDirResult {
  const baseDir = opts.outputDir || config.defaults.outputDir;

  if (opts.file) {
    const absFile = resolve(cwd, opts.file);
    const fileDir = dirname(absFile);
    const resolvedBase = resolve(cwd, baseDir);

    // If the prompt file already lives inside a subdir of baseDir,
    // reuse that directory instead of creating a duplicate.
    if (fileDir.startsWith(resolvedBase + sep) && fileDir !== resolvedBase) {
      return { outputDir: fileDir, promptFilePath: absFile };
    }
    const outputDir = resolveOutputDir(baseDir, slug);
    const promptFilePath = resolve(outputDir, 'prompt.md');
    copyFileSync(absFile, promptFilePath);
    return { outputDir, promptFilePath };
  }

  const outputDir = resolveOutputDir(baseDir, slug);
  const promptFilePath = resolve(outputDir, 'prompt.md');
  safeWriteFile(promptFilePath, promptContent);
  return { outputDir, promptFilePath };
}

// ── Dry-run invocation builder ──

export function buildDryRunInvocations(
  config: Config,
  toolIds: string[],
  promptContent: string,
  outputDir: string,
  readOnlyPolicy: ReadOnlyLevel,
  cwd: string,
) {
  const promptFilePath = resolve(outputDir, 'prompt.md');
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
      extraFlags: toolConfig.extraFlags,
    });
    return {
      toolId: id,
      cmd: inv.cmd,
      args: inv.args,
    };
  });
}

// ── Prompt label helper ──

export function getPromptLabel(
  promptArg: string | undefined,
  file: string | undefined,
): string {
  return promptArg || (file ? `file:${basename(file)}` : 'stdin');
}
