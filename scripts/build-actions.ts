import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const ignoredDirs = new Set(['.git', '.github', 'coverage', 'node_modules', 'scripts']);

type BuildSpawn = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    stdio: 'inherit';
  },
) => Pick<SpawnSyncReturns<Buffer>, 'status'>;

type RunBuildActionsOptions = {
  rootDir: string;
  spawn?: BuildSpawn;
  log?: (message: string) => void;
  error?: (message: string) => void;
};

type HookBuild = {
  sourceFile: string;
  outputDir: string;
  finalFile: string;
};

export function getActionDirs(rootDir: string): string[] {
  return readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !ignoredDirs.has(entry.name))
    .map((entry) => path.join(rootDir, entry.name))
    .filter((actionDir) => existsSync(path.join(actionDir, 'action.yml')));
}

export function runBuildActions({
  rootDir,
  spawn = spawnSync,
  log = console.log,
  error = console.error,
}: RunBuildActionsOptions): number {
  const nccCliPath = path.join(rootDir, 'node_modules', '@vercel', 'ncc', 'dist', 'ncc', 'cli.js');

  if (!existsSync(nccCliPath)) {
    error('ncc is not installed. Run pnpm install before building actions.');
    return 1;
  }

  const actionDirs = getActionDirs(rootDir);

  if (actionDirs.length === 0) {
    log('No root-managed actions found. Skipping build.');
    return 0;
  }

  for (const actionDir of actionDirs) {
    const relativeActionDir = path.relative(rootDir, actionDir);
    const mainSourceFile = path.join(actionDir, 'src', 'index.ts');
    const hookBuilds: HookBuild[] = [
      {
        sourceFile: path.join(actionDir, 'src', 'pre.ts'),
        outputDir: path.join(actionDir, 'dist', 'pre'),
        finalFile: path.join(actionDir, 'dist', 'pre.js'),
      },
      {
        sourceFile: path.join(actionDir, 'src', 'post.ts'),
        outputDir: path.join(actionDir, 'dist', 'post'),
        finalFile: path.join(actionDir, 'dist', 'post.js'),
      },
    ];

    if (!existsSync(mainSourceFile)) {
      error(`${relativeActionDir} is missing src/index.ts.`);
      return 1;
    }

    log(`Building ${relativeActionDir}`);

    rmSync(path.join(actionDir, 'dist'), { recursive: true, force: true });

    const mainResult = spawn(
      process.execPath,
      [
        nccCliPath,
        'build',
        'src/index.ts',
        '--out',
        'dist',
        '--license',
        'licenses.txt',
        '--target',
        'es2022',
      ],
      {
        cwd: actionDir,
        stdio: 'inherit',
      },
    );

    if (mainResult.status !== 0) {
      return mainResult.status ?? 1;
    }

    for (const hookBuild of hookBuilds) {
      if (!existsSync(hookBuild.sourceFile)) {
        continue;
      }

      const result = spawn(
        process.execPath,
        [
          nccCliPath,
          'build',
          path.relative(actionDir, hookBuild.sourceFile),
          '--out',
          path.relative(actionDir, hookBuild.outputDir),
          '--target',
          'es2022',
        ],
        {
          cwd: actionDir,
          stdio: 'inherit',
        },
      );

      if (result.status !== 0) {
        return result.status ?? 1;
      }

      renameSync(path.join(hookBuild.outputDir, 'index.js'), hookBuild.finalFile);
      rmSync(hookBuild.outputDir, { recursive: true, force: true });
    }
  }

  return 0;
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function isDirectExecution(): boolean {
  const scriptPath = process.argv[1];

  return scriptPath !== undefined && path.resolve(scriptPath) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  process.exit(runBuildActions({ rootDir }));
}
