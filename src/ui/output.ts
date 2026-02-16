import ora, { type Ora } from 'ora';
import type {
  DiscoveryResult,
  DoctorCheck,
  RunManifest,
  TestResult,
} from '../types.js';

export function createSpinner(text: string): Ora {
  return ora({ text, stream: process.stderr });
}

export function formatDiscoveryResults(
  results: (DiscoveryResult & { displayName?: string })[],
): string {
  const lines: string[] = ['', 'Discovered tools:', ''];
  for (const r of results) {
    const name = r.displayName || r.toolId;
    if (r.found) {
      lines.push(`  ✓ ${name}`);
      lines.push(`    Path: ${r.path}`);
      if (r.version) lines.push(`    Version: ${r.version}`);
    } else {
      lines.push(`  ✗ ${name} — not found`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

export function formatDoctorResults(checks: DoctorCheck[]): string {
  const lines: string[] = ['', 'Doctor results:', ''];
  for (const c of checks) {
    const icon = c.status === 'pass' ? '✓' : c.status === 'warn' ? '⚠' : '✗';
    lines.push(`  ${icon} ${c.name}: ${c.message}`);
  }
  const failures = checks.filter((c) => c.status === 'fail').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;
  lines.push('');
  if (failures > 0) {
    lines.push(`${failures} check(s) failed.`);
  } else if (warnings > 0) {
    lines.push(`All checks passed with ${warnings} warning(s).`);
  } else {
    lines.push('All checks passed.');
  }
  lines.push('');
  return lines.join('\n');
}

export interface ToolListEntry {
  id: string;
  binary: string;
  args?: string[];
}

export function formatToolList(
  tools: ToolListEntry[],
  verbose?: boolean,
): string {
  if (tools.length === 0) {
    return '\nNo tools configured. Run "counselors init" to get started.\n';
  }

  const lines: string[] = ['', 'Configured tools:', ''];
  for (const t of tools) {
    if (!verbose) {
      lines.push(`  \x1b[1m${t.id}\x1b[0m (${t.binary})`);
      continue;
    }

    const bold = '\x1b[1m';
    const reset = '\x1b[0m';
    lines.push(`  ${bold}${t.id}${reset}`);

    const raw = t.args ?? [];
    const quote = (a: string) => (a.includes(' ') ? `"${a}"` : a);

    // Build the full command, breaking onto new lines at each -- flag
    const allParts = [t.binary, ...raw].map(quote);
    let line = '    ';
    for (const part of allParts) {
      if (part.startsWith('-') && line.trim().length > 0) {
        lines.push(line);
        line = `    ${part}`;
      } else {
        line += (line.trim().length > 0 ? ' ' : '') + part;
      }
    }
    if (line.trim().length > 0) lines.push(line);
  }

  if (!verbose) {
    const dim = '\x1b[2m';
    const reset = '\x1b[0m';
    lines.push('');
    lines.push(`${dim}(Use -v to show flags)${reset}`);
  }

  lines.push('');
  return lines.join('\n');
}

export function formatTestResults(results: TestResult[]): string {
  const lines: string[] = ['', 'Test results:', ''];
  for (const r of results) {
    const icon = r.passed ? '✓' : '✗';
    lines.push(`  ${icon} ${r.toolId} (${r.durationMs}ms)`);
    if (r.command) {
      lines.push(`    $ ${r.command}`);
    }
    if (!r.passed && r.error) {
      lines.push(`    Error: ${r.error}`);
    }
    if (!r.passed && r.output) {
      lines.push(`    Output: ${r.output.slice(0, 200).replace(/\n/g, '\\n')}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

export function formatRunSummary(manifest: RunManifest): string {
  const lines: string[] = ['', `Run complete: ${manifest.slug}`, ''];

  for (const r of manifest.tools) {
    const icon =
      r.status === 'success' ? '✓' : r.status === 'timeout' ? '⏱' : '✗';
    const duration = (r.durationMs / 1000).toFixed(1);
    lines.push(`  ${icon} ${r.toolId} — ${r.wordCount} words, ${duration}s`);
    if (r.cost) {
      lines.push(`    Cost: $${r.cost.cost_usd.toFixed(2)} (${r.cost.source})`);
    }
    if (r.status === 'error' && r.error) {
      lines.push(`    Error: ${r.error}`);
    }
  }

  lines.push('');
  lines.push(
    `Reports saved to: ${manifest.tools[0]?.outputFile ? manifest.tools[0].outputFile.replace(/\/[^/]+$/, '/') : 'output dir'}`,
  );
  lines.push('');
  return lines.join('\n');
}

export function formatDryRun(
  invocations: { toolId: string; cmd: string; args: string[] }[],
): string {
  const lines: string[] = ['', 'Dry run — would dispatch:', ''];
  for (const inv of invocations) {
    lines.push(`  ${inv.toolId}`);
    lines.push(`    $ ${inv.cmd} ${inv.args.join(' ')}`);
  }
  lines.push('');
  return lines.join('\n');
}
