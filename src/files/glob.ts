/**
 * Minimal glob matching, so Qualint needs no glob dependency.
 *
 * Supported: `**` (any number of path segments), `*` (within a segment), `?`,
 * `[abc]` / `[!abc]` character classes and `{a,b}` alternation. Patterns use
 * forward slashes. A pattern without a slash matches against the basename at
 * any depth, the way ESLint overrides behave. A leading `./` is ignored.
 */
const cache = new Map<string, RegExp>();

export function toPosixPath(filePath: string): string {
  return filePath.split('\\').join('/');
}

export function compileGlob(pattern: string): RegExp {
  const cached = cache.get(pattern);
  if (cached !== undefined) {
    return cached;
  }
  let source = pattern;
  if (source.startsWith('./')) {
    source = source.slice(2);
  }
  if (source.endsWith('/')) {
    source = `${source}**`;
  }
  const matchBase = !source.includes('/');
  const body = translate(source);
  const regex = new RegExp(matchBase ? `(?:^|/)${body}$` : `^${body}$`);
  cache.set(pattern, regex);
  return regex;
}

export function matchesGlob(pattern: string, posixPath: string): boolean {
  return compileGlob(pattern).test(posixPath);
}

export function matchesAnyGlob(patterns: readonly string[], posixPath: string): boolean {
  return patterns.some((pattern) => matchesGlob(pattern, posixPath));
}

/** Literal directory prefix of a pattern, used to pick traversal roots. */
export function literalPrefix(pattern: string): string {
  let source = pattern.startsWith('./') ? pattern.slice(2) : pattern;
  const firstSpecial = source.search(/[*?[{]/);
  if (firstSpecial !== -1) {
    source = source.slice(0, firstSpecial);
  }
  const lastSlash = source.lastIndexOf('/');
  return lastSlash === -1 ? '' : source.slice(0, lastSlash);
}

function translate(glob: string): string {
  let out = '';
  let index = 0;
  while (index < glob.length) {
    const char = glob[index]!;
    if (char === '*') {
      if (glob[index + 1] === '*') {
        index += 2;
        if (glob[index] === '/') {
          index++;
          out += '(?:.*/)?';
        } else {
          out += '.*';
        }
        continue;
      }
      out += '[^/]*';
      index++;
      continue;
    }
    if (char === '?') {
      out += '[^/]';
      index++;
      continue;
    }
    if (char === '[') {
      const close = glob.indexOf(']', index + 1);
      if (close === -1) {
        out += '\\[';
        index++;
        continue;
      }
      let cls = glob.slice(index + 1, close);
      if (cls.startsWith('!')) {
        cls = `^${cls.slice(1)}`;
      }
      out += `[${cls.replace(/\\/g, '\\\\')}]`;
      index = close + 1;
      continue;
    }
    if (char === '{') {
      const close = findClosingBrace(glob, index);
      if (close === -1) {
        out += '\\{';
        index++;
        continue;
      }
      const alternatives = splitAlternatives(glob.slice(index + 1, close));
      out += `(?:${alternatives.map(translate).join('|')})`;
      index = close + 1;
      continue;
    }
    out += /[.+^$()|\\/]/.test(char) ? `\\${char}` : char;
    index++;
  }
  return out;
}

function findClosingBrace(glob: string, open: number): number {
  let depth = 0;
  for (let index = open; index < glob.length; index++) {
    if (glob[index] === '{') {
      depth++;
    } else if (glob[index] === '}') {
      depth--;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function splitAlternatives(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
    }
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}
