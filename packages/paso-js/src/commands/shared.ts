import { existsSync } from 'fs';
import { parseFile } from '../parser';
import { validate } from '../validator';
import { PasoDeclaration } from '../types';
import { red, yellow, dim } from '../utils/color';

export function loadAndValidate(filePath: string): PasoDeclaration {
  if (!existsSync(filePath)) {
    console.error(red(`File not found: ${filePath}`) + dim(` Run usepaso init to create one.`));
    process.exit(1);
  }
  const decl = parseFile(filePath);
  const results = validate(decl);
  const errors = results.filter((e) => e.level !== 'warning');
  const warnings = results.filter((e) => e.level === 'warning');

  if (errors.length > 0) {
    console.error(red(`Validation failed with ${errors.length} error(s):`));
    for (const err of errors) {
      console.error(`  ${red(err.path)}: ${err.message}`);
    }
    process.exit(1);
  }

  for (const w of warnings) {
    console.error(`  ${yellow('warning')}: ${w.path}: ${w.message}`);
  }

  return decl;
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'usepaso-service'
  );
}

export function mcpConfigSnippet(serviceName: string): string {
  const slug = slugify(serviceName);
  return `
Connect to an MCP client:

  usepaso connect claude-desktop
  usepaso connect cursor
  usepaso connect vscode
  usepaso connect windsurf

Or add "${slug}" manually to your client config. See: usepaso connect --help`;
}
