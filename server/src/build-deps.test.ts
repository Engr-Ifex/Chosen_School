/**
 * Guards the production build against a missing type package (AGENTS.md §5).
 *
 * Render installs without devDependencies, so any `@types/*` package that the
 * **build** needs must be a regular dependency. This exact mistake broke the
 * Render build on 22 November 2026: `@types/multer` and `@types/pdfkit` had
 * been added as devDependencies, and the local build passed because a local
 * install includes them.
 *
 * The test reads every non-test source file the build compiles, collects the
 * third-party packages it imports, and fails if one of them has its types only
 * in devDependencies.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const serverRoot = join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(serverRoot, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const tsconfig = JSON.parse(readFileSync(join(serverRoot, 'tsconfig.json'), 'utf8')) as { exclude?: string[] };

/** Files the production build excludes explicitly (besides tests). */
const excludedFiles = new Set(
  (tsconfig.exclude ?? []).filter((entry) => !entry.includes('*')).map((entry) => join(serverRoot, entry)),
);

function buildSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return buildSources(path);
    if (!name.endsWith('.ts') || name.endsWith('.test.ts') || name.endsWith('.d.ts')) return [];
    return excludedFiles.has(path) ? [] : [path];
  });
}

/** `express` from 'express', `@supabase/x` from '@supabase/x/sub'. */
function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

/** `@types/foo` for `foo`, `@types/scope__name` for `@scope/name`. */
function typesPackage(name: string): string {
  return name.startsWith('@') ? `@types/${name.slice(1).replace('/', '__')}` : `@types/${name}`;
}

describe('production build dependencies', () => {
  const imported = new Set<string>();
  for (const file of buildSources(join(serverRoot, 'src'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/from '([^'.][^']*)'/g)) {
      const specifier = match[1] ?? '';
      if (!specifier.startsWith('node:')) imported.add(packageName(specifier));
    }
  }

  it('finds the packages the build imports', () => {
    expect(imported.has('express')).toBe(true);
  });

  it('keeps every imported package, and its types, out of devDependencies', () => {
    const problems: string[] = [];
    for (const name of imported) {
      if (name in pkg.devDependencies) problems.push(`${name} is a devDependency but the build imports it`);
      const types = typesPackage(name);
      if (types in pkg.devDependencies) problems.push(`${types} is a devDependency but the build needs it`);
    }
    expect(problems).toEqual([]);
  });
});
