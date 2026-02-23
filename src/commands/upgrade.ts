import type { Command } from 'commander';
import { VERSION } from '../constants.js';
import {
  detectInstallation,
  getStandaloneAssetName,
  performUpgrade,
} from '../core/upgrade.js';
import { error, info, success, warn } from '../ui/logger.js';

const METHOD_LABEL: Record<string, string> = {
  homebrew: 'Homebrew',
  npm: 'npm (global)',
  pnpm: 'pnpm (global)',
  yarn: 'yarn (global)',
  standalone: 'Standalone binary',
  unknown: 'Unknown',
};

const INSTALL_SCRIPT =
  'curl -fsSL https://github.com/aarondfrancis/counselors/raw/main/install.sh | bash';
const MANUAL_UPGRADE_OPTIONS = [
  'brew upgrade counselors',
  'npm install -g counselors@latest',
  'pnpm add -g counselors@latest',
  'yarn global add counselors@latest',
  INSTALL_SCRIPT,
] as const;
const FORCE_NOTE =
  'If this is a standalone install in a non-standard location, re-run with --force.';
const SKILL_TEMPLATE_HISTORY_URL =
  'https://github.com/aarondfrancis/counselors/commits/main/src/commands/skill.ts';

function printSkillUpdateGuidance(): void {
  info('');
  info('The skill template might have changed. Copy and paste this into your LLM:');
  info('');
  info('The counselors CLI has an updated skill template.');
  info('');
  info('1. Run `counselors skill` and capture the full output.');
  info(
    '2. Open my existing counselors skill file and compare VERY CAREFULLY for anything that changed.',
  );
  info('3. Apply the updates manually; do not blindly overwrite.');
  info('4. If you need more context, check the git history for the skill template here:');
  info(`   ${SKILL_TEMPLATE_HISTORY_URL}`);
}

function printManualUpgradeGuidance(): void {
  warn('Try one of:');
  for (const option of MANUAL_UPGRADE_OPTIONS) {
    warn(`  ${option}`);
  }
}

export function registerUpgradeCommand(program: Command): void {
  program
    .command('upgrade')
    .description('Detect install method and upgrade counselors when possible')
    .option('--check', 'Only show install method/version details')
    .option('--dry-run', 'Show what would be done without upgrading')
    .option('--force', 'Force standalone self-upgrade outside safe locations')
    .action(
      async (opts: { check?: boolean; dryRun?: boolean; force?: boolean }) => {
        const detection = detectInstallation();

        info('');
        info(
          `Install method: ${METHOD_LABEL[detection.method] ?? detection.method}`,
        );
        info(`Running version: ${VERSION}`);
        if (detection.installedVersion) {
          info(`Installed version: ${detection.installedVersion}`);
        }
        if (detection.binaryPath) {
          info(`Binary path: ${detection.binaryPath}`);
        }
        info('');

        if (opts.check) return;

        const effective =
          detection.method === 'unknown' && opts.force && detection.binaryPath
            ? { ...detection, method: 'standalone' as const }
            : detection;

        if (opts.dryRun) {
          info('Dry run — no changes will be made.');
          if (detection.method === 'unknown' && !opts.force) {
            info(
              'Install method is unknown; would not run an automatic upgrade.',
            );
            printManualUpgradeGuidance();
            warn(FORCE_NOTE);
            return;
          }

          if (effective.method === 'standalone') {
            const assetName = getStandaloneAssetName();
            const targetPath =
              effective.resolvedBinaryPath ??
              effective.binaryPath ??
              '(unknown)';
            info(`Would self-upgrade standalone binary at: ${targetPath}`);
            if (assetName) {
              info(`Would download: ${assetName} and ${assetName}.sha256`);
            }
          } else {
            info(`Would run: ${effective.upgradeCommand ?? '(unknown)'}`);
          }
          return;
        }

        if (detection.method === 'unknown' && !opts.force) {
          error(
            'Could not detect a supported install method for auto-upgrades.',
          );
          if (detection.binaryPath) {
            warn(`Detected counselors binary at: ${detection.binaryPath}`);
          }
          printManualUpgradeGuidance();
          warn('');
          warn(FORCE_NOTE);
          process.exitCode = 1;
          return;
        }

        info(
          `Upgrading via ${METHOD_LABEL[effective.method] ?? effective.method}...`,
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
      },
    );
}
