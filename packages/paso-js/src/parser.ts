import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { PasoDeclaration } from './types';

/**
 * Parse a paso.yaml file from disk and return the raw declaration object.
 * Does NOT validate — call validate() separately.
 */
export function parseFile(filePath: string): PasoDeclaration {
  const content = readFileSync(filePath, 'utf-8');
  return parseString(content);
}

/**
 * Parse a YAML string into a PasoDeclaration.
 */
export function parseString(content: string): PasoDeclaration {
  const parsed = parseYaml(content);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid YAML: expected an object');
  }
  return parsed as PasoDeclaration;
}
