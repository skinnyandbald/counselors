import type { RunManifest, ToolReport } from '../types.js';
import { AgentReporter } from './agent-reporter.js';
import { TerminalReporter } from './terminal-reporter.js';

export interface Reporter {
  // ── Preset phases (loop-only, called before execution) ──
  discoveryStarted(toolId: string): void;
  discoveryCompleted(toolId: string): void;
  promptWritingStarted(toolId: string): void;
  promptWritingCompleted(toolId: string): void;

  // ── Execution lifecycle (both run and loop) ──
  executionStarted(
    outputDir: string,
    toolIds: string[],
    opts?: { durationMs?: number },
  ): void;
  toolStarted(toolId: string, pid?: number): void;
  toolCompleted(toolId: string, report: ToolReport): void;
  executionFinished(): void;

  // ── Round management (loop-only) ──
  roundStarted(round: number, totalRounds: number): void;
  roundCompleted(round: number): void;
  convergenceDetected(round: number, ratio: number, threshold: number): void;

  // ── Final output (stdout) ──
  printSummary(manifest: RunManifest, opts: { json?: boolean }): void;
}

export class NullReporter implements Reporter {
  discoveryStarted(): void {}
  discoveryCompleted(): void {}
  promptWritingStarted(): void {}
  promptWritingCompleted(): void {}
  executionStarted(): void {}
  toolStarted(): void {}
  toolCompleted(): void {}
  executionFinished(): void {}
  roundStarted(): void {}
  roundCompleted(): void {}
  convergenceDetected(): void {}
  printSummary(): void {}
}

export function createReporter(opts?: { dryRun?: boolean }): Reporter {
  if (opts?.dryRun) return new NullReporter();
  if (process.stderr.isTTY) return new TerminalReporter();
  return new AgentReporter();
}
