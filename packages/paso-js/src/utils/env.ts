import { join, dirname } from 'path';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';

/**
 * Load variables from a .env file into process.env.
 * Does NOT override existing environment variables.
 * If envFilePath is provided, loads from that path. Otherwise loads .env relative to yamlPath.
 * Returns true if a .env file was found and loaded.
 */
export function loadEnvFile(yamlPath: string, envFilePath?: string): boolean {
  const envPath = envFilePath || join(dirname(yamlPath), '.env');
  if (!existsSync(envPath)) return false;

  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Do not override existing env vars
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return true;
}

/**
 * Check if .env is tracked by git in the given directory.
 * Returns true if tracked (bad), false if untracked or not a git repo.
 */
export function isEnvTrackedByGit(dir: string): boolean {
  try {
    const result = execSync('git ls-files .env', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Ensure .env is listed in .gitignore. Creates .gitignore if it doesn't exist.
 */
export function ensureGitignore(dir: string): void {
  const gitignorePath = join(dir, '.gitignore');
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    if (content.split('\n').some((line) => line.trim() === '.env')) return;
    appendFileSync(gitignorePath, '\n.env\n');
  } else {
    writeFileSync(gitignorePath, '.env\n');
  }
}
