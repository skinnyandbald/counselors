import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOutputDir,
  expandDuplicateToolIds,
  getPromptLabel,
  resolvePrompt,
  resolveReadOnlyPolicy,
} from '../../src/commands/_run-shared.js';
import type { Config } from '../../src/types.js';

// Suppress logger output during tests
vi.mock('../../src/ui/logger.js', () => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

function makeConfig(
  overrides?: Partial<Config> & { tools?: Config['tools'] },
): Config {
  return {
    version: 1,
    defaults: {
      timeout: 540,
      outputDir: './agents/counselors',
      readOnly: 'bestEffort',
      maxContextKb: 50,
      maxParallel: 4,
    },
    tools: overrides?.tools ?? {
      claude: {
        binary: '/usr/bin/claude',
        adapter: 'claude',
        readOnly: { level: 'enforced' },
      },
    },
    groups: overrides?.groups ?? {},
  };
}

describe('expandDuplicateToolIds', () => {
  it('returns unchanged when no duplicates', () => {
    const config = makeConfig({
      tools: {
        claude: {
          binary: '/usr/bin/claude',
          adapter: 'claude',
          readOnly: { level: 'enforced' },
        },
        codex: {
          binary: '/usr/bin/codex',
          adapter: 'codex',
          readOnly: { level: 'enforced' },
        },
      },
    });

    const result = expandDuplicateToolIds(['claude', 'codex'], config);
    expect(result.toolIds).toEqual(['claude', 'codex']);
    // Config object should be same reference (no copy needed)
    expect(result.config).toBe(config);
  });

  it('expands duplicate tool IDs with __N suffixes', () => {
    const config = makeConfig();
    const result = expandDuplicateToolIds(
      ['claude', 'claude', 'claude'],
      config,
    );

    expect(result.toolIds).toEqual(['claude', 'claude__2', 'claude__3']);
    expect(result.config.tools.claude__2).toBeDefined();
    expect(result.config.tools.claude__3).toBeDefined();
    expect(result.config.tools.claude__2.binary).toBe('/usr/bin/claude');
  });

  it('skips existing suffixed keys to avoid collisions', () => {
    const config = makeConfig({
      tools: {
        claude: {
          binary: '/usr/bin/claude',
          adapter: 'claude',
          readOnly: { level: 'enforced' },
        },
        claude__2: {
          binary: '/usr/bin/claude',
          adapter: 'claude',
          readOnly: { level: 'enforced' },
        },
      },
    });

    const result = expandDuplicateToolIds(['claude', 'claude'], config);
    // Should skip __2 since it already exists and go to __3
    expect(result.toolIds).toEqual(['claude', 'claude__3']);
    expect(result.config.tools.claude__3).toBeDefined();
  });

  it('sets adapter field for built-in tools without explicit adapter', () => {
    const config = makeConfig({
      tools: {
        claude: {
          binary: '/usr/bin/claude',
          // No adapter field — built-in tool should get it auto-set
          readOnly: { level: 'enforced' },
        },
      },
    });

    const result = expandDuplicateToolIds(['claude', 'claude'], config);
    expect(result.config.tools.claude__2.adapter).toBe('claude');
  });
});

describe('resolveReadOnlyPolicy', () => {
  it('maps "strict" to "enforced"', () => {
    const config = makeConfig();
    expect(resolveReadOnlyPolicy('strict', config)).toBe('enforced');
  });

  it('maps "best-effort" to "bestEffort"', () => {
    const config = makeConfig();
    expect(resolveReadOnlyPolicy('best-effort', config)).toBe('bestEffort');
  });

  it('maps "off" to "none"', () => {
    const config = makeConfig();
    expect(resolveReadOnlyPolicy('off', config)).toBe('none');
  });

  it('falls back to config default when input is undefined', () => {
    const config = makeConfig();
    // Config default is 'bestEffort' → maps to CLI 'best-effort' → maps to 'bestEffort'
    expect(resolveReadOnlyPolicy(undefined, config)).toBe('bestEffort');
  });

  it('falls back to config default "enforced" correctly', () => {
    const config = makeConfig();
    config.defaults.readOnly = 'enforced';
    expect(resolveReadOnlyPolicy(undefined, config)).toBe('enforced');
  });

  it('falls back to config default "none" correctly', () => {
    const config = makeConfig();
    config.defaults.readOnly = 'none';
    expect(resolveReadOnlyPolicy(undefined, config)).toBe('none');
  });

  it('returns null for invalid input', () => {
    const config = makeConfig();
    const original = process.exitCode;
    const result = resolveReadOnlyPolicy('invalid', config);
    expect(result).toBeNull();
    expect(process.exitCode).toBe(1);
    process.exitCode = original;
  });
});

describe('getPromptLabel', () => {
  it('returns prompt arg when provided', () => {
    expect(getPromptLabel('find bugs', 'some-file.md')).toBe('find bugs');
  });

  it('returns file label when no prompt arg', () => {
    expect(getPromptLabel(undefined, 'prompts/review.md')).toBe(
      'file:review.md',
    );
  });

  it('returns "stdin" when neither prompt nor file', () => {
    expect(getPromptLabel(undefined, undefined)).toBe('stdin');
  });
});

describe('createOutputDir', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `counselors-shared-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('creates output dir and writes prompt.md for inline prompt', () => {
    const config = makeConfig();
    config.defaults.outputDir = testDir;

    const result = createOutputDir(
      {},
      'test-slug',
      'my prompt content',
      '/tmp',
      config,
    );

    expect(result.outputDir).toContain('test-slug');
    expect(result.promptFilePath).toContain('prompt.md');
    const written = readFileSync(result.promptFilePath, 'utf-8');
    expect(written).toBe('my prompt content');
  });

  it('copies file when using --file outside base dir', () => {
    const config = makeConfig();
    config.defaults.outputDir = testDir;

    // Create a prompt file outside the base dir
    const externalFile = join(testDir, 'external-prompt.md');
    writeFileSync(externalFile, 'file content here');

    const result = createOutputDir(
      { file: 'external-prompt.md' },
      'file-slug',
      '',
      testDir,
      config,
    );

    expect(result.outputDir).toContain('file-slug');
    const copied = readFileSync(result.promptFilePath, 'utf-8');
    expect(copied).toBe('file content here');
  });

  it('reuses directory when file is inside base dir', () => {
    const config = makeConfig();
    const baseDir = join(testDir, 'agents', 'counselors');
    config.defaults.outputDir = baseDir;

    // Create a subdir inside baseDir with a prompt file
    const subDir = join(baseDir, 'existing-run');
    mkdirSync(subDir, { recursive: true });
    const promptFile = join(subDir, 'prompt.md');
    writeFileSync(promptFile, 'existing prompt');

    const result = createOutputDir(
      { file: promptFile },
      'unused-slug',
      '',
      '/',
      config,
    );

    // Should reuse the existing directory
    expect(result.outputDir).toBe(subDir);
    expect(result.promptFilePath).toBe(promptFile);
  });

  it('resolvePrompt with --file appends --context', async () => {
    const promptFile = join(testDir, 'my-prompt.md');
    writeFileSync(promptFile, 'Check this code');
    // Create a context file for gatherContext to pick up
    const contextFile = join(testDir, 'src.ts');
    writeFileSync(contextFile, 'const x = 1;');

    const config = makeConfig();
    const result = await resolvePrompt(
      undefined,
      { file: promptFile, context: 'src.ts' },
      testDir,
      config,
    );

    expect(result).not.toBeNull();
    expect(result!.promptContent).toContain('Check this code');
    expect(result!.promptContent).toContain('const x = 1;');
    expect(result!.promptSource).toBe('file');
  });

  it('resolvePrompt with --file without --context returns file only', async () => {
    const promptFile = join(testDir, 'my-prompt.md');
    writeFileSync(promptFile, 'Just the file');

    const config = makeConfig();
    const result = await resolvePrompt(
      undefined,
      { file: promptFile },
      testDir,
      config,
    );

    expect(result).not.toBeNull();
    expect(result!.promptContent).toBe('Just the file');
    expect(result!.promptSource).toBe('file');
  });

  it('resolvePrompt from stdin is wrapped by default', async () => {
    const config = makeConfig();
    const stdin = Readable.from([
      Buffer.from('  review from stdin  ', 'utf-8'),
    ]) as NodeJS.ReadStream;
    Object.defineProperty(stdin, 'isTTY', { value: false });
    const stdinSpy = vi.spyOn(process, 'stdin', 'get').mockReturnValue(stdin);

    try {
      const result = await resolvePrompt(undefined, {}, testDir, config);
      expect(result).not.toBeNull();
      expect(result!.promptSource).toBe('stdin');
      expect(result!.promptContent).toContain('# Second Opinion Request');
      expect(result!.promptContent).toContain('review from stdin');
    } finally {
      stdinSpy.mockRestore();
    }
  });

  it('resolvePrompt from stdin can skip wrapping', async () => {
    const config = makeConfig();
    const stdin = Readable.from([
      Buffer.from('  review from stdin  ', 'utf-8'),
    ]) as NodeJS.ReadStream;
    Object.defineProperty(stdin, 'isTTY', { value: false });
    const stdinSpy = vi.spyOn(process, 'stdin', 'get').mockReturnValue(stdin);

    try {
      const result = await resolvePrompt(
        undefined,
        { enrichStdinPrompt: false },
        testDir,
        config,
      );
      expect(result).not.toBeNull();
      expect(result!.promptSource).toBe('stdin');
      expect(result!.promptContent).toBe('review from stdin');
      expect(result!.promptContent).not.toContain('# Second Opinion Request');
    } finally {
      stdinSpy.mockRestore();
    }
  });

  it('respects --output-dir override', () => {
    const config = makeConfig();
    const customDir = join(testDir, 'custom-output');
    mkdirSync(customDir, { recursive: true });

    const result = createOutputDir(
      { outputDir: customDir },
      'override-slug',
      'content',
      '/tmp',
      config,
    );

    expect(result.outputDir).toContain('override-slug');
    expect(resolve(result.outputDir)).toContain(resolve(customDir));
  });
});
