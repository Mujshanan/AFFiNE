import { describe, expect, it } from 'vitest';

import { runFixtureManifest } from './index.js';

describe('executable Khwarizmi v1 fixture manifest', () => {
  it('runs every fixture and fails on any unexpected outcome', () => {
    const report = runFixtureManifest();

    expect(report.total).toBe(30);
    expect(report.failed).toBe(0);
    expect(report.passed + report.blocked).toBe(report.total);
    expect(report.results.every(result => result.status !== 'failed')).toBe(
      true
    );
  });

  it('makes unimplemented runtime stages explicit instead of silently skipping them', () => {
    const report = runFixtureManifest();
    const blockedStages = [
      ...new Set(
        report.results
          .filter(result => result.status === 'blocked')
          .map(result => result.stage)
      ),
    ];

    expect(blockedStages).toEqual(
      expect.arrayContaining(['authoring-parse', 'evaluation', 'rpc-integrity'])
    );
    expect(report.blocked).toBeGreaterThan(0);
  });

  it('allows future stage adapters to execute the same manifest entries', () => {
    const report = runFixtureManifest({
      adapters: {
        'authoring-parse': fixture => ({
          outcome: fixture.expectedOutcome,
          diagnostics: fixture.diagnostic ? [fixture.diagnostic] : [],
        }),
      },
    });

    expect(
      report.results.find(result => result.stage === 'authoring-parse')?.status
    ).toBe('passed');
  });
});
