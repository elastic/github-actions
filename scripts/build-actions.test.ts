import path from 'node:path';
import { vol } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs');

const { getActionDirs, runBuildActions } = await import('./build-actions');

const rootDir = '/repo';

function seedFs(files: Record<string, string>): void {
  vol.fromJSON(files, rootDir);
}

beforeEach(() => {
  vol.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getActionDirs', () => {
  it('returns root-managed actions only', () => {
    seedFs({
      '/repo/alpha/action.yml': '',
      '/repo/beta/README.md': '',
      '/repo/.github/action.yml': '',
      '/repo/project-assigner/action.yml': '',
      '/repo/scripts/action.yml': '',
    });

    expect(getActionDirs(rootDir)).toEqual([path.join(rootDir, 'alpha')]);
  });
});

describe('runBuildActions', () => {
  it('returns an error when ncc is unavailable', () => {
    const error = vi.fn();

    expect(runBuildActions({ rootDir, error })).toBe(1);
    expect(error).toHaveBeenCalledWith('ncc is not installed. Run pnpm install before building actions.');
  });

  it('skips building when no root-managed actions exist', () => {
    const log = vi.fn();
    seedFs({
      '/repo/node_modules/@vercel/ncc/dist/ncc/cli.js': '',
    });

    expect(runBuildActions({ rootDir, log })).toBe(0);
    expect(log).toHaveBeenCalledWith('No root-managed actions found. Skipping build.');
  });

  it('builds the main action bundle', () => {
    const actionDir = path.join(rootDir, 'my-action');
    const spawn = vi.fn((_, args: string[], options: { cwd: string }) => {
      const outputDir = path.join(options.cwd, args[args.indexOf('--out') + 1]!);
      seedFs({
        [path.join(outputDir, 'index.js')]: 'module.exports = "main";',
        [path.join(outputDir, 'licenses.txt')]: 'license text',
      });

      return { status: 0 };
    });

    seedFs({
      '/repo/node_modules/@vercel/ncc/dist/ncc/cli.js': '',
      '/repo/my-action/action.yml': '',
      '/repo/my-action/src/index.ts': 'export {};',
    });

    expect(runBuildActions({ rootDir, spawn })).toBe(0);
    expect(spawn).toHaveBeenCalledOnce();
    expect(vol.readFileSync(path.join(actionDir, 'dist', 'index.js'), 'utf8')).toContain('main');
    expect(vol.readFileSync(path.join(actionDir, 'dist', 'licenses.txt'), 'utf8')).toContain('license text');
  });

  it('builds optional pre and post bundles to flat dist files', () => {
    const actionDir = path.join(rootDir, 'my-action');
    const spawn = vi.fn((_, args: string[], options: { cwd: string }) => {
      const outputDir = path.join(options.cwd, args[args.indexOf('--out') + 1]!);
      const entryFile = args[2];
      const writes: Record<string, string> = {
        [path.join(outputDir, 'index.js')]: `module.exports = ${JSON.stringify(entryFile)};`,
      };

      if (args.includes('--license')) {
        writes[path.join(outputDir, 'licenses.txt')] = 'license text';
      }

      seedFs(writes);
      return { status: 0 };
    });

    seedFs({
      '/repo/node_modules/@vercel/ncc/dist/ncc/cli.js': '',
      '/repo/my-action/action.yml': '',
      '/repo/my-action/src/index.ts': 'export {};',
      '/repo/my-action/src/pre.ts': 'export {};',
      '/repo/my-action/src/post.ts': 'export {};',
      '/repo/my-action/dist/pre.js': 'stale pre',
      '/repo/my-action/dist/post.js': 'stale post',
    });

    expect(runBuildActions({ rootDir, spawn })).toBe(0);
    expect(spawn).toHaveBeenCalledTimes(3);
    expect(spawn).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.arrayContaining(['src/index.ts', '--out', 'dist', '--license', 'licenses.txt']),
      expect.objectContaining({ cwd: actionDir }),
    );
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.arrayContaining(['src/pre.ts', '--out', path.join('dist', 'pre')]),
      expect.objectContaining({ cwd: actionDir }),
    );
    expect(spawn).toHaveBeenNthCalledWith(
      3,
      expect.any(String),
      expect.arrayContaining(['src/post.ts', '--out', path.join('dist', 'post')]),
      expect.objectContaining({ cwd: actionDir }),
    );
    expect(vol.readFileSync(path.join(actionDir, 'dist', 'pre.js'), 'utf8')).toContain('src/pre.ts');
    expect(vol.readFileSync(path.join(actionDir, 'dist', 'post.js'), 'utf8')).toContain('src/post.ts');
    expect(vol.existsSync(path.join(actionDir, 'dist', 'pre'))).toBe(false);
    expect(vol.existsSync(path.join(actionDir, 'dist', 'post'))).toBe(false);
  });

  it('fails when an action is missing src/index.ts', () => {
    const error = vi.fn();

    seedFs({
      '/repo/node_modules/@vercel/ncc/dist/ncc/cli.js': '',
      '/repo/my-action/action.yml': '',
    });

    expect(runBuildActions({ rootDir, error })).toBe(1);
    expect(error).toHaveBeenCalledWith('my-action is missing src/index.ts.');
  });
});
