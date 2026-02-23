import type { Command } from 'commander';
import { loadConfig, loadProjectConfig, mergeConfigs } from '../core/config.js';
import { gatherContext } from '../core/context.js';
import {
  buildPrompt,
  generateSlug,
  resolveOutputDir,
} from '../core/prompt-builder.js';
import { info } from '../ui/logger.js';
import { createOutputDir, resolvePrompt } from './_run-shared.js';

export function registerMakeDirCommand(program: Command): void {
  program
    .command('mkdir [prompt]')
    .description(
      'Create an output directory and optionally write prompt.md without dispatching (supports prompt arg, -f, or stdin)',
    )
    .option('-f, --file <path>', 'Use a pre-built prompt file (no wrapping)')
    .option(
      '--context <paths>',
      'Gather context from paths (comma-separated, or "." for git diff)',
    )
    .option('-o, --output-dir <dir>', 'Base output directory')
    .option(
      '--json',
      'Output metadata as JSON (outputDir, promptFilePath, slug, promptSource). promptFilePath is null when no prompt is provided.',
    )
    .action(
      async (
        promptArg: string | undefined,
        opts: {
          file?: string;
          context?: string;
          outputDir?: string;
          json?: boolean;
        },
      ) => {
        const cwd = process.cwd();
        const globalConfig = loadConfig();
        const projectConfig = loadProjectConfig(cwd);
        const config = mergeConfigs(globalConfig, projectConfig);

        const hasExplicitPromptInput = Boolean(promptArg || opts.file);
        let prompt = hasExplicitPromptInput
          ? await resolvePrompt(promptArg, opts, cwd, config)
          : null;
        if (hasExplicitPromptInput && !prompt) return;

        // In non-TTY contexts, stdin may be an empty pipe. Treat empty stdin as
        // "no prompt provided" so mkdir can still create a directory-only run.
        if (!prompt && !process.stdin.isTTY) {
          const chunks: Buffer[] = [];
          for await (const chunk of process.stdin) {
            chunks.push(chunk);
          }

          const stdinContent = Buffer.concat(chunks).toString('utf-8').trim();
          if (stdinContent) {
            const context = opts.context
              ? gatherContext(
                  cwd,
                  opts.context === '.' ? [] : opts.context.split(','),
                  config.defaults.maxContextKb,
                )
              : undefined;
            prompt = {
              promptContent: buildPrompt(stdinContent, context),
              promptSource: 'stdin' as const,
              slug: generateSlug(stdinContent),
            };
          }
        }

        if (!prompt) {
          const slug = generateSlug('manual-prompt');
          const baseDir = opts.outputDir || config.defaults.outputDir;
          const outputDir = resolveOutputDir(baseDir, slug);

          if (opts.json) {
            info(
              JSON.stringify(
                {
                  outputDir,
                  promptFilePath: null,
                  slug,
                  promptSource: 'none',
                },
                null,
                2,
              ),
            );
            return;
          }

          info(`Output directory: ${outputDir}`);
          info('Prompt file: (not created)');
          info(`Slug: ${slug}`);
          return;
        }

        const slug = prompt.slug || generateSlug('prompt');
        const { outputDir, promptFilePath } = createOutputDir(
          opts,
          slug,
          prompt.promptContent,
          cwd,
          config,
        );

        if (opts.json) {
          info(
            JSON.stringify(
              {
                outputDir,
                promptFilePath,
                slug,
                promptSource: prompt.promptSource,
              },
              null,
              2,
            ),
          );
          return;
        }

        info(`Output directory: ${outputDir}`);
        info(`Prompt file: ${promptFilePath}`);
        info(`Slug: ${slug}`);
      },
    );
}
