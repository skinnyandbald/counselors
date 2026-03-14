import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, beforeAll } from 'vitest';
import { OpenRouterAdapter } from '../../../src/adapters/openrouter.js';
import type { RunRequest } from '../../../src/types.js';

describe('OpenRouterAdapter', () => {
  const adapter = new OpenRouterAdapter();

  const baseRequest: RunRequest = {
    prompt: 'test prompt',
    promptFilePath: '/tmp/prompt.md',
    toolId: 'openrouter',
    outputDir: '/tmp/out',
    readOnlyPolicy: 'bestEffort',
    timeout: 540,
    cwd: '/tmp',
    extraFlags: ['--model', 'anthropic/claude-opus-4'],
  };

  it('has correct metadata', () => {
    expect(adapter.id).toBe('openrouter');
    expect(adapter.readOnly.level).toBe('enforced');
    expect(adapter.modelFlag).toBe('--model');
  });

  it('includes grok model', () => {
    const grok = adapter.models.find((m) => m.id === 'grok-4.20');
    expect(grok).toBeDefined();
    expect(grok!.compoundId).toBe('or-grok-4.20');
    expect(grok!.extraFlags).toEqual(['--model', 'x-ai/grok-4.20-beta']);
  });

  it('has 7 models covering all major providers', () => {
    expect(adapter.models).toHaveLength(7);
    const ids = adapter.models.map((m) => m.id);
    expect(ids).toContain('claude-opus');
    expect(ids).toContain('gemini-3.1-pro');
    expect(ids).toContain('codex-5.4');
    expect(ids).toContain('grok-4.20');
    expect(ids).toContain('llama-4-maverick');
  });

  it('builds invocation with extraFlags and stdin', () => {
    const inv = adapter.buildInvocation(baseRequest);
    expect(inv.cmd).toBe('openrouter-agent');
    expect(inv.args).toEqual(['--model', 'anthropic/claude-opus-4']);
    expect(inv.stdin).toBe('test prompt');
    expect(inv.cwd).toBe('/tmp');
  });

  it('uses req.binary when provided', () => {
    const req = { ...baseRequest, binary: '/usr/local/bin/openrouter-agent' };
    const inv = adapter.buildInvocation(req);
    expect(inv.cmd).toBe('/usr/local/bin/openrouter-agent');
  });

  it('falls back to "openrouter-agent" when req.binary is undefined', () => {
    const inv = adapter.buildInvocation(baseRequest);
    expect(inv.cmd).toBe('openrouter-agent');
  });

  describe('file ref resolution', () => {
    const testDir = join(tmpdir(), `counselors-test-${Date.now()}`);
    const round1File = join(testDir, 'round-1', 'or-claude-opus.md');

    beforeAll(() => {
      mkdirSync(join(testDir, 'round-1'), { recursive: true });
      writeFileSync(round1File, 'Found a bug in auth.ts line 42.');
    });

    it('resolves @file references to inline content', () => {
      const prompt = `Review this code.\n\n## Prior Round Outputs\n\n@${round1File}`;
      const req = { ...baseRequest, prompt };
      const inv = adapter.buildInvocation(req);
      expect(inv.stdin).toContain('Found a bug in auth.ts line 42.');
      expect(inv.stdin).toContain('--- or-claude-opus.md ---');
      expect(inv.stdin).toContain('--- end or-claude-opus.md ---');
      expect(inv.stdin).not.toContain(`@${round1File}`);
    });

    it('leaves non-existent @file references as-is', () => {
      const prompt = `Review this.\n\n@/nonexistent/path/file.md`;
      const req = { ...baseRequest, prompt };
      const inv = adapter.buildInvocation(req);
      expect(inv.stdin).toContain('@/nonexistent/path/file.md');
    });

    it('does not resolve @mentions that are not file paths', () => {
      const prompt = 'cc @alice and @bob for review';
      const req = { ...baseRequest, prompt };
      const inv = adapter.buildInvocation(req);
      expect(inv.stdin).toBe('cc @alice and @bob for review');
    });

    it('resolves multiple @file references', () => {
      const file2 = join(testDir, 'round-1', 'or-gemini.md');
      writeFileSync(file2, 'Confirmed the auth bug.');
      const prompt = `Review.\n\n@${round1File}\n@${file2}`;
      const req = { ...baseRequest, prompt };
      const inv = adapter.buildInvocation(req);
      expect(inv.stdin).toContain('Found a bug in auth.ts line 42.');
      expect(inv.stdin).toContain('Confirmed the auth bug.');
    });

    it('passes through prompts with no @file refs unchanged', () => {
      const inv = adapter.buildInvocation(baseRequest);
      expect(inv.stdin).toBe('test prompt');
    });
  });
});
