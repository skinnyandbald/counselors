import { describe, expect, it } from 'vitest';
import { formatTestResults, formatToolList } from '../../src/ui/output.js';

describe('formatToolList', () => {
  const tools = [
    { id: 'claude-opus', binary: '/bin/claude' },
    { id: 'codex-5.3', binary: '/bin/codex' },
  ];

  it('shows hint in non-verbose mode', () => {
    const output = formatToolList(tools);
    expect(output).toContain('Use -v to show flags');
  });

  it('hides hint in verbose mode', () => {
    const toolsWithArgs = tools.map((t) => ({
      ...t,
      args: ['--model', 'test'],
    }));
    const output = formatToolList(toolsWithArgs, true);
    expect(output).not.toContain('Use -v to show flags');
  });

  it('shows empty message when no tools', () => {
    const output = formatToolList([]);
    expect(output).toContain('No tools configured');
    expect(output).not.toContain('Use -v to show flags');
  });

  it('lists tool IDs and binaries', () => {
    const output = formatToolList(tools);
    expect(output).toContain('claude-opus');
    expect(output).toContain('/bin/claude');
    expect(output).toContain('codex-5.3');
    expect(output).toContain('/bin/codex');
  });
});

describe('formatTestResults', () => {
  it('shows command when present', () => {
    const output = formatTestResults([
      {
        toolId: 'claude-opus',
        passed: true,
        output: 'OK',
        durationMs: 100,
        command: '/bin/claude -p --output-format text --model opus',
      },
    ]);
    expect(output).toContain(
      '$ /bin/claude -p --output-format text --model opus',
    );
  });

  it('omits command line when command is undefined', () => {
    const output = formatTestResults([
      {
        toolId: 'claude-opus',
        passed: true,
        output: 'OK',
        durationMs: 100,
      },
    ]);
    expect(output).toContain('claude-opus');
    expect(output).not.toContain('$');
  });

  it('shows error and command together on failure', () => {
    const output = formatTestResults([
      {
        toolId: 'broken',
        passed: false,
        output: '',
        error: 'binary not found',
        durationMs: 50,
        command: '/bin/broken -p',
      },
    ]);
    expect(output).toContain('✗ broken');
    expect(output).toContain('$ /bin/broken -p');
    expect(output).toContain('Error: binary not found');
  });
});
