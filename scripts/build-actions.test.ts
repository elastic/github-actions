import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getActionDirs, runBuildActions } from './build-actions.ts';

const tempDirs: string[] = [];

function createTempRoot(): string {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'build-actions-'));
  tempDirs.push(tempDir);
  return tempDir;
}

function writeFile(rootDir: string, relativePath: string, contents = ''): void {
  const filePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

afterEach(() => {
  vi.restoreAllMocks();

  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

describe('getActionDirs', () => {
  it('returns root-managed actions only', () => {
    const rootDir = createTempRoot();
    writeFile(rootDir, 'alpha/action.yml');
    writeFile(rootDir, 'beta/README.md');
    writeFile(rootDir, '.github/action.yml');
    writeFile(rootDir, 'project-assigner/action.yml');
    writeFile(rootDir, 'scripts/action.yml');

    expect(getActionDirs(rootDir)).toEqual([path.join(rootDir, 'alpha')]);
  });
});

describe('runBuildActions', () => {
  it('returns an error when ncc is unavailable', () => {
    const rootDir = createTempRoot();
    const error = vi.fn();

    expect(runBuildActions({ rootDir, error })).toBe(1);
    expect(error).toHaveBeenCalledWith('ncc is not installed. Run pnpm install before building actions.');
  });

  it('skips building when no root-managed actions exist', () => {
    const rootDir = createTempRoot();
    const log = vi.fn();
    writeFile(rootDir, 'node_modules/@vercel/ncc/dist/ncc/index.js');

    expect(runBuildActions({ rootDir, log })).toBe(0);
    expect(log).toHaveBeenCalledWith('No root-managed actions found. Skipping build.');
  });

  it('builds actions with ncc', () => {
    const rootDir = createTempRoot();
    const log = vi.fn();
    const spawn = vi.fn(() => ({ status: 0 }));
    const actionDir = path.join(rootDir, 'my-action');

    writeFile(rootDir, 'node_modules/@vercel/ncc/dist/ncc/index.js');
    writeFile(rootDir, 'my-action/action.yml');
    writeFile(rootDir, 'my-action/src/index.ts', 'export {};');

    expect(runBuildActions({ rootDir, log, spawn })).toBe(0);
    expect(log).toHaveBeenCalledWith('Building my-action');
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [
        path.join(rootDir, 'node_modules', '@vercel', 'ncc', 'dist', 'ncc', 'index.js'),
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
  });

  it('fails when an action is missing src/index.ts', () => {
    const rootDir = createTempRoot();
    const error = vi.fn();

    writeFile(rootDir, 'node_modules/@vercel/ncc/dist/ncc/index.js');
    writeFile(rootDir, 'my-action/action.yml');

    expect(runBuildActions({ rootDir, error })).toBe(1);
    expect(error).toHaveBeenCalledWith('my-action is missing src/index.ts.');
  });
});
