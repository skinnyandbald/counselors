import { mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const version: string = pkg.version;
const outDir = 'release';

mkdirSync(outDir, { recursive: true });

const targets = [
  { bun: 'bun-darwin-arm64', suffix: 'darwin-arm64' },
  { bun: 'bun-darwin-x64', suffix: 'darwin-x64' },
  { bun: 'bun-linux-x64', suffix: 'linux-x64' },
  { bun: 'bun-linux-arm64', suffix: 'linux-arm64' },
];

for (const target of targets) {
  const outfile = `${outDir}/counselors-${target.suffix}`;
  const args = [
    'build', '--compile',
    '--target', target.bun,
    '--define', `__VERSION__="${version}"`,
    '--outfile', outfile,
    './src/cli.ts',
  ];

  console.log(`Building ${outfile}...`);
  execFileSync('bun', args, { stdio: 'inherit' });
}

console.log('Done.');
