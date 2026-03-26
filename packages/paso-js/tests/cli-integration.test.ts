import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { execFileSync, ExecFileSyncOptions } from 'child_process';
import { resolve, join } from 'path';
import { existsSync, unlinkSync, mkdirSync, mkdtempSync, rmdirSync } from 'fs';
import { tmpdir } from 'os';

const CLI = resolve(__dirname, '../dist/cli.js');
const FIXTURES = resolve(__dirname, '../../../examples');
const SENTRY_YAML = join(FIXTURES, 'sentry/usepaso.yaml');

/** Run the CLI and return { stdout, stderr, exitCode }. */
function run(
  args: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {},
): { stdout: string; stderr: string; exitCode: number } {
  const execOpts: ExecFileSyncOptions = {
    cwd: opts.cwd,
    env: { ...process.env, NO_COLOR: '1', ...opts.env },
    timeout: 10000,
  };
  try {
    const stdout = execFileSync('node', [CLI, ...args], execOpts).toString();
    return { stdout, stderr: '', exitCode: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      stdout: err.stdout?.toString() || '',
      stderr: err.stderr?.toString() || '',
      exitCode: err.status ?? 1,
    };
  }
}

describe('CLI integration: validate', () => {
  it('succeeds on a valid file', () => {
    const { stdout, exitCode } = run(['validate', '-f', SENTRY_YAML]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('valid');
    expect(stdout).toContain('Sentry');
    expect(stdout).toContain('0 regrets');
  });

  it('fails on a non-existent file', () => {
    const { stderr, exitCode } = run(['validate', '-f', '/tmp/nonexistent.yaml']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not found');
  });

  it('outputs valid JSON with --json flag', () => {
    const { stdout, exitCode } = run(['validate', '-f', SENTRY_YAML, '--json']);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.valid).toBe(true);
  });

  it('produces same output as plain validate (no-color parity)', () => {
    const { stdout, exitCode } = run(['validate', '-f', SENTRY_YAML]);
    expect(exitCode).toBe(0);
    // Plain text output must contain the standard format
    expect(stdout).toMatch(/valid.*Sentry.*\d+ capabilities.*0 regrets/);
  });
});

describe('CLI integration: inspect', () => {
  it('outputs valid JSON with --json flag', () => {
    const { stdout, exitCode } = run(['inspect', '-f', SENTRY_YAML, '--json']);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.service).toBeDefined();
    expect(parsed.tools).toBeDefined();
  });
});

describe('CLI integration: test --dry-run', () => {
  it('shows HTTP method and URL for dry run', () => {
    const { stdout, exitCode } = run([
      'test',
      'list_issues',
      '-f',
      SENTRY_YAML,
      '--dry-run',
      '--param',
      'organization_slug=acme',
      '--param',
      'project_slug=backend',
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('GET');
    expect(stdout).toContain('sentry.io');
  });
});

describe('CLI integration: test without args', () => {
  it('lists available capabilities when no capability is specified', () => {
    const { stdout } = run(['test', '-f', SENTRY_YAML]);
    expect(stdout).toContain('list_issues');
  });
});

describe('CLI integration: doctor', () => {
  it('runs checks and reports results', () => {
    const { stdout, stderr, exitCode } = run(['doctor', '-f', SENTRY_YAML]);
    const output = stdout + stderr;
    // Doctor should find the file, parse it, and validate it
    expect(output).toContain('usepaso.yaml found');
    expect(output).toContain('YAML parses correctly');
    expect(output).toContain('Validation passes');
    // Exit code 0 if all checks pass, 1 if some fail (auth token missing, URL unreachable)
    expect([0, 1]).toContain(exitCode);
  }, 15000); // Doctor makes a network request to check base_url — needs extra time
});

describe('CLI integration: init', () => {
  let initTmpDir: string;

  beforeAll(() => {
    initTmpDir = mkdtempSync(join(tmpdir(), 'usepaso-test-init-'));
  });

  afterAll(() => {
    try {
      const yamlPath = join(initTmpDir, 'usepaso.yaml');
      if (existsSync(yamlPath)) unlinkSync(yamlPath);
      if (existsSync(initTmpDir)) rmdirSync(initTmpDir);
    } catch {
      // cleanup best-effort
    }
  });

  it('creates a usepaso.yaml file', () => {
    const { stdout, exitCode } = run(['init', '--name', 'TestService'], { cwd: initTmpDir });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Created');
    expect(stdout).toContain('Next steps');
    expect(existsSync(join(initTmpDir, 'usepaso.yaml'))).toBe(true);
  });

  it('refuses to overwrite existing file', () => {
    const { stderr, exitCode } = run(['init', '--name', 'TestService'], { cwd: initTmpDir });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('already exists');
  });
});

describe('CLI integration: version', () => {
  it('prints the version', () => {
    const { stdout, exitCode } = run(['version']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('CLI integration: --help', () => {
  it('shows help text for root command', () => {
    const { stdout, exitCode } = run(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('validate');
    expect(stdout).toContain('inspect');
    expect(stdout).toContain('serve');
    expect(stdout).toContain('test');
    expect(stdout).toContain('init');
    expect(stdout).toContain('doctor');
    expect(stdout).toContain('version');
    expect(stdout).toContain('completion');
  });
});

describe('CLI integration: test --all --dry-run', () => {
  it('tests all capabilities and shows pass count', () => {
    const { stdout, exitCode } = run(['test', '--all', '--dry-run', '-f', SENTRY_YAML]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('list_issues');
    expect(stdout).toContain('passed');
    expect(stdout).toContain('capabilities total');
  });

  it('requires --dry-run with --all', () => {
    const { stderr, exitCode } = run(['test', '--all', '-f', SENTRY_YAML]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--all requires --dry-run');
  });
});

describe('CLI integration: validate --strict', () => {
  it('reports best-practice warnings', () => {
    const { stdout, stderr, exitCode } = run(['validate', '--strict', '-f', SENTRY_YAML]);
    const output = stdout + stderr;
    // Sentry example has assign_issue without constraints — should be caught
    expect(output).toContain('best-practice');
  });
});

describe('CLI integration: completion', () => {
  it('outputs bash completion script', () => {
    const { stdout, exitCode } = run(['completion']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('complete');
    expect(stdout).toContain('usepaso');
  });

  it('outputs zsh completion script', () => {
    const { stdout, exitCode } = run(['completion', '--shell', 'zsh']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('compdef');
  });
});
