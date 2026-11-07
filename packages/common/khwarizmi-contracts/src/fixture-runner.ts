import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateJsonSchema, validateSchemaBundle } from './json-schema.js';
import {
  validateCalculationSemantics,
  validateDependencyGraph,
  validateUnitReference,
} from './semantic-validator.js';

export interface FixtureManifestEntry {
  id: string;
  kind: string;
  path: string;
  stage: string;
  expectedOutcome: string;
  diagnostic?: string;
}

export interface FixtureRunResult {
  id: string;
  stage: string;
  status: 'passed' | 'failed' | 'blocked';
  expectedOutcome: string;
  actualOutcome?: string;
  diagnostics: string[];
  message?: string;
}

export interface FixtureRunReport {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  results: FixtureRunResult[];
}

export interface FixtureRunnerOptions {
  repositoryRoot?: string;
  /** Future runtime stages are injected here; absent adapters are reported as blocked, never skipped. */
  adapters?: Record<
    string,
    (
      fixture: FixtureManifestEntry,
      payload: unknown
    ) => {
      outcome: string;
      diagnostics?: string[];
    }
  >;
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function collectSchemaBundle(root: string): Record<string, any> {
  const schemaRoot = resolve(root, 'contracts/schemas/v1');
  const fixtureRoot = resolve(root, 'contracts/fixtures/v1');
  const schemaFiles = [
    ...filesUnder(schemaRoot).filter(path => path.endsWith('.schema.json')),
    resolve(fixtureRoot, 'manifest.schema.json'),
  ];
  return Object.fromEntries(
    schemaFiles.map(path => [
      relative(root, path).split(sep).join('/'),
      readJson(path),
    ])
  );
}

function compareOutcome(
  fixture: FixtureManifestEntry,
  actualOutcome: string,
  diagnostics: string[]
): boolean {
  if (
    fixture.expectedOutcome === 'accept' ||
    fixture.expectedOutcome === 'completed'
  ) {
    return (
      actualOutcome === fixture.expectedOutcome && diagnostics.length === 0
    );
  }
  if (fixture.expectedOutcome === 'reject') {
    return (
      actualOutcome === 'reject' &&
      (!fixture.diagnostic || diagnostics.includes(fixture.diagnostic))
    );
  }
  if (fixture.expectedOutcome === 'completedWithErrors') {
    return (
      actualOutcome === 'completedWithErrors' &&
      (!fixture.diagnostic || diagnostics.includes(fixture.diagnostic))
    );
  }
  return false;
}

function builtInStage(
  fixture: FixtureManifestEntry,
  payload: any,
  schemas: Record<string, any>,
  unitRegistry: unknown
): { outcome: string; diagnostics: string[] } | undefined {
  if (fixture.stage === 'schema-and-profile') {
    const expression = payload.expression ?? payload;
    const result = validateJsonSchema(
      expression,
      'contracts/schemas/v1/expression.schema.json',
      schemas
    );
    const diagnostics = result.valid
      ? []
      : [fixture.diagnostic ?? 'SCHEMA_INVALID'];
    return { outcome: result.valid ? 'accept' : 'reject', diagnostics };
  }

  if (fixture.stage === 'mathjson-profile') {
    const expression = payload.expression ?? payload;
    const mathJson = expression.mathJson ?? expression;
    const result = validateJsonSchema(
      mathJson,
      'contracts/schemas/v1/mathjson-profile.schema.json',
      schemas
    );
    const diagnostics = result.valid
      ? []
      : [fixture.diagnostic ?? 'SCHEMA_INVALID'];
    return { outcome: result.valid ? 'accept' : 'reject', diagnostics };
  }

  if (fixture.stage === 'semantic-validation') {
    let result;
    if (payload.document) {
      result = validateCalculationSemantics(payload.document, { unitRegistry });
    } else if (Array.isArray(payload.dependencyGraph)) {
      result = validateDependencyGraph(payload.dependencyGraph);
    } else if (typeof payload.unitId === 'string') {
      result = validateUnitReference(payload.unitId, unitRegistry);
    } else {
      return { outcome: 'reject', diagnostics: ['INVALID_FIXTURE_SHAPE'] };
    }
    return {
      outcome: result.valid ? 'accept' : 'reject',
      diagnostics: result.diagnostics.map(item => item.code),
    };
  }

  if (fixture.stage === 'rpc-envelope') {
    const result = validateJsonSchema(
      payload,
      'contracts/schemas/v1/rpc-envelope.schema.json',
      schemas
    );
    return {
      outcome: result.valid ? 'accept' : 'reject',
      diagnostics: result.errors.map(
        issue => issue.keyword + ':' + issue.instancePath
      ),
    };
  }

  return undefined;
}

/**
 * Runs every manifest entry in manifest order. A stage without an implementation
 * is reported as blocked, making incomplete conformance visible to CI.
 */
export function runFixtureManifest(
  options: FixtureRunnerOptions = {}
): FixtureRunReport {
  const root = resolve(
    options.repositoryRoot ??
      fileURLToPath(new URL('../../../../', import.meta.url))
  );
  const fixtureRoot = resolve(root, 'contracts/fixtures/v1');
  const manifest = readJson(resolve(fixtureRoot, 'manifest.json'));
  const manifestSchema = readJson(resolve(fixtureRoot, 'manifest.schema.json'));
  const schemas = collectSchemaBundle(root);
  const schemaBundleResult = validateSchemaBundle(schemas);
  if (!schemaBundleResult.valid) {
    throw new Error(
      'Contract schema bundle validation failed: ' +
        JSON.stringify(schemaBundleResult.errors)
    );
  }
  const unitRegistry = readJson(
    resolve(root, 'contracts/schemas/v1/unit-registry.v1.json')
  );
  const manifestResult = validateJsonSchema(
    manifest,
    'contracts/fixtures/v1/manifest.schema.json',
    {
      ...schemas,
      'contracts/fixtures/v1/manifest.schema.json': manifestSchema,
    }
  );
  if (!manifestResult.valid) {
    throw new Error(
      'Fixture manifest schema validation failed: ' +
        JSON.stringify(manifestResult.errors)
    );
  }

  const results: FixtureRunResult[] = [];
  for (const fixture of manifest.fixtures as FixtureManifestEntry[]) {
    const path = resolve(fixtureRoot, fixture.path);
    const relativeFixturePath = relative(fixtureRoot, path);
    if (
      !existsSync(path) ||
      isAbsolute(relativeFixturePath) ||
      relativeFixturePath === '..' ||
      relativeFixturePath.startsWith('..' + sep)
    ) {
      results.push({
        id: fixture.id,
        stage: fixture.stage,
        status: 'failed',
        expectedOutcome: fixture.expectedOutcome,
        diagnostics: ['FIXTURE_PATH_INVALID'],
        message: 'Fixture path is missing or escapes the fixture root',
      });
      continue;
    }

    const payload = readJson(path);
    const adapted = options.adapters?.[fixture.stage]?.(fixture, payload);
    const actual =
      adapted ?? builtInStage(fixture, payload, schemas, unitRegistry);
    if (!actual) {
      results.push({
        id: fixture.id,
        stage: fixture.stage,
        status: 'blocked',
        expectedOutcome: fixture.expectedOutcome,
        diagnostics: [],
        message: 'No executable adapter is registered for this fixture stage',
      });
      continue;
    }

    const passed = compareOutcome(
      fixture,
      actual.outcome,
      actual.diagnostics ?? []
    );
    results.push({
      id: fixture.id,
      stage: fixture.stage,
      status: passed ? 'passed' : 'failed',
      expectedOutcome: fixture.expectedOutcome,
      actualOutcome: actual.outcome,
      diagnostics: actual.diagnostics ?? [],
      ...(passed
        ? {}
        : {
            message:
              'Actual fixture result does not match the manifest expectation',
          }),
    });
  }

  return {
    total: results.length,
    passed: results.filter(result => result.status === 'passed').length,
    failed: results.filter(result => result.status === 'failed').length,
    blocked: results.filter(result => result.status === 'blocked').length,
    results,
  };
}
