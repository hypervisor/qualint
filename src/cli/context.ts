import type { Writable } from 'node:stream';

/** Everything a command needs from the process, injectable for tests. */
export interface CliContext {
  cwd: string;
  stdout: Writable;
  stderr: Writable;
  color: boolean;
  /** Print clean files and configuration details, not only problems. */
  verbose: boolean;
}

export const EXIT_OK = 0;
export const EXIT_PROBLEMS = 1;
export const EXIT_FAILURE = 2;

export function writeLine(stream: Writable, text: string): void {
  stream.write(text.endsWith('\n') ? text : `${text}\n`);
}
