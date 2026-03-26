import { resolve } from 'path';
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

export function mcpConfigSnippet(filePath: string, serviceName: string): string {
  const absPath = resolve(filePath);
  const slug = serviceName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `
Add this to your MCP client config:

Claude Desktop (claude_desktop_config.json):
{
  "mcpServers": {
    "${slug}": {
      "command": "npx",
      "args": ["usepaso", "serve", "-f", "${absPath}"],
      "env": { "USEPASO_AUTH_TOKEN": "your-token" }
    }
  }
}

Cursor (.cursor/mcp.json):
{
  "${slug}": {
    "command": "npx",
    "args": ["usepaso", "serve", "-f", "${absPath}"],
    "env": { "USEPASO_AUTH_TOKEN": "your-token" }
  }
}`;
}
