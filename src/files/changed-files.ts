import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}

export interface ChangedFilesOptions {
  cwd: string;
  /**
   * Compare against the merge-base of this ref and HEAD, so everything the
   * current branch changed counts. Without it, only the working tree relative
   * to HEAD counts (staged, unstaged and untracked files).
   */
  since?: string | undefined;
}

/**
 * Absolute, symlink-resolved paths of files added, copied, modified or renamed
 * in git. Deleted files are left out since there is nothing to analyze.
 * Untracked files that are not ignored count as changed.
 */
export async function listChangedFiles(options: ChangedFilesOptions): Promise<Set<string>> {
  const root = (await git(options.cwd, ['rev-parse', '--show-toplevel'])).trim();
  const base = options.since === undefined ? 'HEAD' : (await git(root, ['merge-base', options.since, 'HEAD'])).trim();
  const [tracked, untracked] = await Promise.all([
    git(root, ['diff', '--name-only', '-z', '--diff-filter=ACMR', base, '--']),
    git(root, ['ls-files', '--others', '--exclude-standard', '-z']),
  ]);
  const changed = new Set<string>();
  for (const relative of [...splitNul(tracked), ...splitNul(untracked)]) {
    changed.add(path.resolve(root, relative));
  }
  return changed;
}

function splitNul(output: string): string[] {
  return output.split('\0').filter((entry) => entry.length > 0);
}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    const detail = error instanceof Error && 'stderr' in error ? String((error as { stderr: unknown }).stderr).trim() : '';
    throw new GitError(`git ${args.slice(0, 2).join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
}
