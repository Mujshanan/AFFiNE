import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  validateCalculationSemantics,
  validateDependencyGraph,
  validateDiagnosticCodeMembership,
  validateDiagnosticRegistrySemantics,
  validateJsonSchema,
  validateSchemaBundle,
  validateUnitReference,
  validateUnitRegistrySemantics,
} from '../src/index.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
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
const manifest = readJson(resolve(fixtureRoot, 'manifest.json'));
const unitRegistry = readJson(resolve(schemaRoot, 'unit-registry.v1.json'));
const diagnosticRegistry = readJson(
  resolve(schemaRoot, 'diagnostic-codes.json')
);

describe('Khwarizmi v1 contract schemas', () => {
  it('resolves every schema reference and rejects unsupported schema keywords', () => {
    expect(validateSchemaBundle(schemaBundle).errors).toEqual([]);
  });

  it('enforces RPC envelope exclusivity and empty getInfo params', () => {
    const schemaPath = 'contracts/schemas/v1/rpc-envelope.schema.json';
    const validInfo = {
      jsonrpc: '2.0',
      id: 1,
      method: 'host.getInfo',
      params: {},
    };
    expect(validateJsonSchema(validInfo, schemaPath, schemaBundle).valid).toBe(
      true
    );
    expect(
      validateJsonSchema(
        {
          ...validInfo,
          params: { unexpected: true },
        },
        schemaPath,
        schemaBundle
      ).valid
    ).toBe(false);

    const validResponse = { jsonrpc: '2.0', id: 1, result: { ok: true } };
    expect(
      validateJsonSchema(validResponse, schemaPath, schemaBundle).valid
    ).toBe(true);
    expect(
      validateJsonSchema(
        {
          ...validResponse,
          error: { code: -32603, message: 'internal error' },
        },
        schemaPath,
        schemaBundle
      ).valid
    ).toBe(false);
  });

  it('validates the fixture manifest and complete file inventory', () => {
    const result = validateJsonSchema(
      manifest,
      'contracts/fixtures/v1/manifest.schema.json',
      schemaBundle
    );
    expect(result.errors).toEqual([]);
    const ids = manifest.fixtures.map((fixture: any) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const fixture of manifest.fixtures)
      expect(existsSync(resolve(fixtureRoot, fixture.path))).toBe(true);
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

  it('validates the diagnostic registry and every fixture diagnostic code', () => {
    const schema = validateJsonSchema(
      diagnosticRegistry,
      'contracts/schemas/v1/diagnostic-registry.schema.json',
      schemaBundle
    );
    expect(schema.errors).toEqual([]);
    expect(
      validateDiagnosticRegistrySemantics(diagnosticRegistry).diagnostics
    ).toEqual([]);
    const fixtureCodes = manifest.fixtures
      .map((fixture: any) => fixture.diagnostic)
      .filter((code: unknown): code is string => typeof code === 'string');
    expect(
      validateDiagnosticCodeMembership(fixtureCodes, diagnosticRegistry)
        .diagnostics
    ).toEqual([]);
  });

  it('enforces minimum MathJSON operator arities, including Rational and Log', () => {
    const profile = 'contracts/schemas/v1/mathjson-profile.schema.json';
    for (const expression of [['Rational', 1], ['Sin', 1, 2], ['Log']]) {
      expect(validateJsonSchema(expression, profile, schemaBundle).valid).toBe(
        false
      );
    }
    for (const expression of [
      ['Rational', 1, 2],
      ['Sin', 1],
      ['Log', 2],
      ['Log', 2, 10],
    ]) {
      expect(validateJsonSchema(expression, profile, schemaBundle).valid).toBe(
        true
      );
    }
    const conditionRecord = {
      format: 'khwarizmi.condition-expression',
      schemaVersion: 1,
      mathJson: ['Not'],
      symbolBindings: [],
      authoredNumbers: [],
      unitAttachments: [],
      sourceMap: [
        { path: '', nodeId: 'condition-root', blockId: 'block-test' },
      ],
    };
    expect(
      validateJsonSchema(
        conditionRecord,
        'contracts/schemas/v1/condition-expression.schema.json',
        schemaBundle
      ).valid
    ).toBe(false);
    conditionRecord.mathJson = ['Not', 'True'];
    expect(
      validateJsonSchema(
        conditionRecord,
        'contracts/schemas/v1/condition-expression.schema.json',
        schemaBundle
      ).valid
    ).toBe(true);
  });

  it('validates fixture payloads wherever a schema boundary is defined', () => {
    const failures: string[] = [];
    for (const fixture of manifest.fixtures) {
      const data = readJson(resolve(fixtureRoot, fixture.path));
      let result: ReturnType<typeof validateJsonSchema> | undefined;
      if (data.format === 'khwarizmi.expression') {
        result = validateJsonSchema(
          data,
          'contracts/schemas/v1/expression.schema.json',
          schemaBundle
        );
      } else if (data.expression) {
        result = validateJsonSchema(
          data.expression,
          'contracts/schemas/v1/expression.schema.json',
          schemaBundle
        );
      } else if (data.document) {
        result = validateJsonSchema(
          data.document,
          'contracts/schemas/v1/calculation-document.schema.json',
          schemaBundle
        );
      } else if (data.jsonrpc === '2.0') {
        result = validateJsonSchema(
          data,
          'contracts/schemas/v1/rpc-envelope.schema.json',
          schemaBundle
        );
      }
      if (result) {
        const shouldFailSchema = fixture.stage === 'mathjson-profile';
        if (shouldFailSchema === result.valid)
          failures.push(
            fixture.id +
              ': unexpected schema result: ' +
              JSON.stringify(result.errors)
          );
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('Khwarizmi v1 semantic validators', () => {
  it('matches all semantic-validation fixture diagnostics', () => {
    const failures: string[] = [];
    for (const fixture of manifest.fixtures.filter(
      (entry: any) => entry.stage === 'semantic-validation'
    )) {
      const data = readJson(resolve(fixtureRoot, fixture.path));
      let actual: string[] = [];
      if (data.document)
        actual = validateCalculationSemantics(data.document, {
          unitRegistry,
        }).diagnostics.map(item => item.code);
      else if (Array.isArray(data.dependencyGraph))
        actual = validateDependencyGraph(data.dependencyGraph).diagnostics.map(
          item => item.code
        );
      else if (typeof data.unitId === 'string')
        actual = validateUnitReference(
          data.unitId,
          unitRegistry
        ).diagnostics.map(item => item.code);
      const expected =
        data.expected?.diagnostics ??
        (fixture.diagnostic ? [fixture.diagnostic] : []);
      if (
        JSON.stringify(
          [...new Set(actual)].sort((a, b) => a.localeCompare(b))
        ) !==
        JSON.stringify(
          [...new Set(expected)].sort((a, b) => a.localeCompare(b))
        )
      ) {
        failures.push(
          fixture.id +
            ': expected [' +
            expected.join(', ') +
            '], got [' +
            actual.join(', ') +
            ']'
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it('accepts nested local capture and rejects no-shadowing, leakage, and use-before-declaration', () => {
    const valid = readJson(
      resolve(fixtureRoot, 'semantics/nested-local-capture.json')
    );
    expect(
      validateCalculationSemantics(valid.document, { unitRegistry }).diagnostics
    ).toEqual([]);
    for (const name of [
      'no-shadowing.json',
      'local-scope-leak.json',
      'local-before-declaration.json',
    ]) {
      const fixture = readJson(resolve(fixtureRoot, 'semantics', name));
      const codes = validateCalculationSemantics(fixture.document, {
        unitRegistry,
      }).diagnostics.map(item => item.code);
      expect(codes).toContain(fixture.expected.diagnostics[0]);
    }
  });

  it('rejects cycles in persisted dependency snapshots', () => {
    const fixture = readJson(
      resolve(fixtureRoot, 'semantics/dependency-cycle-cache.json')
    );
    expect(
      validateDependencyGraph(fixture.dependencyGraph).diagnostics.map(
        item => item.code
      )
    ).toContain('DEPENDENCY_CYCLE');
  });
});
