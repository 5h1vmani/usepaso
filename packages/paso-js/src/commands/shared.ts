import { resolve } from 'path';
import { existsSync } from 'fs';
import { parseFile } from '../parser';
import { validate } from '../validator';
import { PasoDeclaration } from '../types';

export function loadAndValidate(filePath: string): PasoDeclaration {
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const decl = parseFile(filePath);
  const errors = validate(decl);
  if (errors.length > 0) {
    console.error(`Validation failed with ${errors.length} error(s):`);
    for (const err of errors) {
      console.error(`  ${err.path}: ${err.message}`);
    }
    process.exit(1);
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
