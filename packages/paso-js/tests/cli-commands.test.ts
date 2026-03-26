import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';

const CLI_PATH = join(__dirname, '../dist/cli.js');

function run(args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args}`, {
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 10000,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout || '',
      stderr: e.stderr || '',
      exitCode: e.status || 1,
    };
  }
}

describe('usepaso version', () => {
  it('prints version number', () => {
    const result = run('version');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('--version flag also works', () => {
    const result = run('--version');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('usepaso doctor', () => {
  it('runs checks on a valid file', () => {
    const sentry = join(__dirname, '../../../examples/sentry/usepaso.yaml');
    const result = run(`doctor -f "${sentry}"`);
    // Doctor may fail on base_url connectivity, but should at least parse and validate
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('usepaso doctor');
    expect(combined).toContain('YAML parses correctly');
    expect(combined).toContain('Validation passes');
  }, 15000);

  it('fails on missing file', () => {
    const result = run('doctor -f nonexistent.yaml');
    expect(result.exitCode).toBe(1);
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('FAIL');
  });
});
