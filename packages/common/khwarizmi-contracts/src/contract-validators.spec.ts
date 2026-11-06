import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  validateCalculationSemantics,
  validateDependencyGraph,
  validateJsonSchema,
  validateUnitReference,
  validateUnitRegistrySemantics,
} from '../src/index.js';

const root = process.cwd();
const schemaRoot = resolve(root, 'contracts/schemas/v1');
const fixtureRoot = resolve(root, 'contracts/fixtures/v1');

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function repositoryPath(path: string): string {
  return relative(root, path).split(sep).join('/');
}

const schemaFiles = [
  ...filesUnder(schemaRoot).filter(path => path.endsWith('.schema.json')),
  resolve(fixtureRoot, 'manifest.schema.json'),
];
const schemaBundle = Object.fromEntries(
  schemaFiles.map(path => [repositoryPath(path), readJson(path)])
);
const manifestPath = resolve(fixtureRoot, 'manifest.json');
const manifest = readJson(manifestPath);
const unitRegistryPath = resolve(schemaRoot, 'unit-registry.v1.json');
const unitRegistry = readJson(unitRegistryPath);

describe('Khwarizmi v1 contract schemas', () => {
  it('validates the fixture manifest and its complete file inventory', () => {
    const result = validateJsonSchema(
      manifest,
      'contracts/fixtures/v1/manifest.schema.json',
      schemaBundle
    );
    expect(result.errors).toEqual([]);
    const ids = manifest.fixtures.map((fixture: any) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const fixture of manifest.fixtures) {
      expect(existsSync(resolve(fixtureRoot, fixture.path))).toBe(true);
    }
  });

  it('validates the built-in unit registry schema and semantic invariants', () => {
    const schema = validateJsonSchema(
      unitRegistry,
      'contracts/schemas/v1/unit-registry.schema.json',
      schemaBundle
    );
    expect(schema.errors).toEqual([]);
    expect(validateUnitRegistrySemantics(unitRegistry).diagnostics).toEqual([]);
  });

  it('validates every fixture at its declared structural boundary', () => {
    const failures: string[] = [];
    for (const fixture of manifest.fixtures) {
      const data = readJson(resolve(fixtureRoot, fixture.path));
      let result: ReturnType<typeof validateJsonSchema> | undefined;
      if (data.format === 'khwarizmi.expression') {
        result = validateJsonSchema(data, 'contracts/schemas/v1/expression.schema.json', schemaBundle);
      } else if (data.expression) {
        result = validateJsonSchema(data.expression, 'contracts/schemas/v1/expression.schema.json', schemaBundle);
      } else if (data.document) {
        result = validateJsonSchema(data.document, 'contracts/schemas/v1/calculation-document.schema.json', schemaBundle);
      } else if (data.jsonrpc === '2.0') {
        result = validateJsonSchema(data, 'contracts/schemas/v1/rpc-envelope.schema.json', schemaBundle);
      }

      if (result) {
        const shouldFailSchema = fixture.stage === 'mathjson-profile';
        if (shouldFailSchema === result.valid) {
          failures.push(fixture.id + ': expected schema ' + (shouldFailSchema ? 'rejection' : 'acceptance') + ', got ' + (result.valid ? 'valid' : result.errors.map(error => error.keyword).join(',')));
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('Khwarizmi v1 semantic validators', () => {
  it('matches all semantic-validation fixture diagnostics', () => {
    const failures: string[] = [];
    for (const fixture of manifest.fixtures.filter((entry: any) => entry.stage === 'semantic-validation')) {
      const data = readJson(resolve(fixtureRoot, fixture.path));
      let actual: string[] = [];
      if (data.document) {
        actual = validateCalculationSemantics(data.document, { unitRegistry }).diagnostics.map(item => item.code);
      } else if (Array.isArray(data.dependencyGraph)) {
        actual = validateDependencyGraph(data.dependencyGraph).diagnostics.map(item => item.code);
      } else if (typeof data.unitId === 'string') {
        actual = validateUnitReference(data.unitId, unitRegistry).diagnostics.map(item => item.code);
      }
      const expected = data.expected?.diagnostics ?? (fixture.diagnostic ? [fixture.diagnostic] : []);
      if (JSON.stringify([...new Set(actual)].sort()) !== JSON.stringify([...new Set(expected)].sort())) {
        failures.push(fixture.id + ': expected [' + expected.join(', ') + '], got [' + actual.join(', ') + ']');
      }
    }
    expect(failures).toEqual([]);
  });

  it('accepts nested local capture and rejects no-shadowing, local leakage, and use-before-declaration', () => {
    const valid = readJson(resolve(fixtureRoot, 'semantics/nested-local-capture.json'));
    expect(validateCalculationSemantics(valid.document, { unitRegistry }).diagnostics).toEqual([]);
    for (const name of ['no-shadowing.json', 'local-scope-leak.json', 'local-before-declaration.json']) {
      const fixture = readJson(resolve(fixtureRoot, 'semantics', name));
      const codes = validateCalculationSemantics(fixture.document, { unitRegistry }).diagnostics.map(item => item.code);
      expect(codes).toContain(fixture.expected.diagnostics[0]);
    }
  });

  it('rejects cycles in persisted dependency snapshots', () => {
    const fixture = readJson(resolve(fixtureRoot, 'semantics/dependency-cycle-cache.json'));
    expect(validateDependencyGraph(fixture.dependencyGraph).diagnostics.map(item => item.code)).toContain('DEPENDENCY_CYCLE');
  });
});
