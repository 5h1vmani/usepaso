import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';
import YAML from 'yaml';

const FIXTURES_DIR = join(__dirname, '../../../test-fixtures/cli-output');
const CLI_PATH = join(__dirname, '../dist/cli.js');

interface CliFixture {
  description: string;
  file: string;
  command: string;
  expected_stdout_contains?: string[];
  expected_stderr_contains?: string[];
  expected_stdout_json?: Record<string, unknown>;
  expected_exit_code: number;
}

function runCli(
  command: string,
  file: string,
  fixtureDir: string,
): { stdout: string; stderr: string; exitCode: number } {
  const filePath = resolve(fixtureDir, file);
  const args = command.split(' ');
  const cmd = `node ${CLI_PATH} ${args[0]} -f "${filePath}" ${args.slice(1).join(' ')}`;

  try {
    const stdout = execSync(cmd, {
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

const fixtureFiles = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.yaml'));

describe('CLI output parity fixtures', () => {
  for (const file of fixtureFiles) {
    it(file.replace('.yaml', ''), () => {
      const content = readFileSync(join(FIXTURES_DIR, file), 'utf-8');
      const fixture = YAML.parse(content) as CliFixture;

      const result = runCli(fixture.command, fixture.file, FIXTURES_DIR);

      expect(result.exitCode).toBe(fixture.expected_exit_code);

      if (fixture.expected_stdout_contains) {
        for (const needle of fixture.expected_stdout_contains) {
          expect(result.stdout).toContain(needle);
        }
      }

      if (fixture.expected_stderr_contains) {
        const combined = result.stdout + result.stderr;
        for (const needle of fixture.expected_stderr_contains) {
          expect(combined).toContain(needle);
        }
      }

      if (fixture.expected_stdout_json) {
        const parsed = JSON.parse(result.stdout.trim());
        for (const [key, value] of Object.entries(fixture.expected_stdout_json)) {
          expect(parsed[key]).toEqual(value);
        }
      }
    });
  }
});
