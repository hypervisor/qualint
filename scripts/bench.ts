/**
 * Repeatable benchmark: generates N synthetic but realistic TypeScript files in a
 * temporary directory and times a full analysis run through the CLI entry point.
 *
 *   node scripts/bench.ts [fileCount]
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { run } from '../src/cli/index.ts';

const fileCount = Number(process.argv[2] ?? 1000);

function generateFile(index: number): string {
  const helper = `helper${index % 7}`;
  const functions = Array.from({ length: 6 }, (_, fn) => `
export function process${index}_${fn}(items: Item${index}[], limit = ${fn}): number {
  let total = 0;
  for (const item of items) {
    if (item.qty > limit && item.price !== undefined) {
      total += item.qty * (item.price ?? 0);
    } else if (item.tags.includes("free")) {
      continue;
    } else {
      total += ${helper}(item.id, item.qty);
    }
  }
  const label = total > 100 ? "large" : total > 10 ? "medium" : "small";
  switch (label) {
    case "large":
      return Math.round(total);
    case "medium":
      return total;
    default:
      return items.map((item) => item.qty).reduce((a, b) => a + b, 0);
  }
}
`);
  return `import { ${helper} } from './${helper}';

export interface Item${index} {
  id: string;
  qty: number;
  price?: number;
  tags: string[];
}
${functions.join('')}
export class Service${index} {
  private readonly cache = new Map<string, number>();
  constructor(private readonly prefix: string) {}
  get size(): number { return this.cache.size; }
  async load(id: string): Promise<number | undefined> {
    try {
      return this.cache.get(\`\${this.prefix}:\${id}\`) ?? (await Promise.resolve(1));
    } catch (error) {
      return undefined;
    } finally {
      this.cache.delete(id);
    }
  }
}
`;
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'qualint-bench-'));
for (let index = 0; index < fileCount; index++) {
  const dir = path.join(root, 'src', `module${index % 25}`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `file${index}.ts`), generateFile(index));
}

const devNull = new Writable({ write: (_chunk, _encoding, callback) => callback() });
// Warm-up run loads the parser; the measured run reflects steady-state analysis.
await run(['src/module0'], { cwd: root, stdout: devNull, stderr: devNull });
const started = performance.now();
const code = await run(['--format', 'json'], { cwd: root, stdout: devNull, stderr: devNull });
const elapsed = performance.now() - started;
console.log(`${fileCount} files analyzed in ${(elapsed / 1000).toFixed(2)}s (exit ${code}, ${(elapsed / fileCount).toFixed(2)} ms/file)`);
await fs.rm(root, { recursive: true, force: true });
