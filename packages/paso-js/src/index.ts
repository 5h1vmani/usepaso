export { parseFile, parseString } from './parser';
export { validate } from './validator';
export { generateMcpServer } from './generators/mcp';
export { generateFromOpenApi } from './openapi';
export { buildRequest, executeRequest, formatError } from './executor';
export type { OpenApiResult } from './openapi';
export type {
  PasoDeclaration,
  PasoService,
  PasoAuth,
  PasoCapability,
  PasoInput,
  PasoOutput,
  PasoConstraint,
  PasoPermissions,
  ValidationError,
} from './types';

import { parseFile, parseString } from './parser';
import { validate } from './validator';
import { PasoDeclaration, ValidationError } from './types';

export interface ParseResult {
  declaration: PasoDeclaration;
  warnings: ValidationError[];
}

/**
 * Parse a YAML string and validate it. Throws if validation fails.
 * Returns both the declaration and any warnings.
 */
export function parseAndValidate(content: string): ParseResult {
  const decl = parseString(content);
  const errors = validate(decl);
  const realErrors = errors.filter((e) => e.level !== 'warning');
  const warnings = errors.filter((e) => e.level === 'warning');
  if (realErrors.length > 0) {
    throw new Error(
      `Validation failed:\n${realErrors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`,
    );
  }
  return { declaration: decl, warnings };
}

/**
 * Parse a YAML file and validate it. Throws if validation fails.
 * Returns both the declaration and any warnings.
 */
export function parseFileAndValidate(filePath: string): ParseResult {
  const decl = parseFile(filePath);
  const errors = validate(decl);
  const realErrors = errors.filter((e) => e.level !== 'warning');
  const warnings = errors.filter((e) => e.level === 'warning');
  if (realErrors.length > 0) {
    throw new Error(
      `Validation failed:\n${realErrors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`,
    );
  }
  return { declaration: decl, warnings };
}
