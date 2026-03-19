import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nccCliPath = path.join(rootDir, 'node_modules', '@vercel', 'ncc', 'dist', 'ncc', 'index.js');
const ignoredDirs = new Set(['.git', '.github', 'coverage', 'node_modules', 'project-assigner', 'scripts']);

function getActionDirs() {
  return readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !ignoredDirs.has(entry.name))
    .map((entry) => path.join(rootDir, entry.name))
    .filter((actionDir) => existsSync(path.join(actionDir, 'action.yml')));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(nccCliPath)) {
  fail('ncc is not installed. Run npm install before building actions.');
}

const actionDirs = getActionDirs();

if (actionDirs.length === 0) {
  console.log('No root-managed actions found. Skipping build.');
  process.exit(0);
}

for (const actionDir of actionDirs) {
  const entryFile = path.join(actionDir, 'src', 'index.ts');
  const relativeActionDir = path.relative(rootDir, actionDir);

  if (!existsSync(entryFile)) {
    fail(`${relativeActionDir} is missing src/index.ts.`);
  }

  console.log(`Building ${relativeActionDir}`);

  const result = spawnSync(
    process.execPath,
    [nccCliPath, 'build', 'src/index.ts', '--out', 'dist', '--license', 'licenses.txt', '--target', 'es2022'],
    {
      cwd: actionDir,
      stdio: 'inherit',
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
