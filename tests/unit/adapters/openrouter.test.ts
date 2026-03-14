import { describe, expect, it } from 'vitest';
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
});
