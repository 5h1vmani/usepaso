#!/usr/bin/env node

import { Command } from 'commander';
import { resolve, join } from 'path';
import { existsSync, writeFileSync } from 'fs';
import { parseFile } from './parser';
import { validate } from './validator';
import { serveMcp } from './generators/mcp';

const program = new Command();

program
  .name('usepaso')
  .description('Make your API agent-ready in minutes')
  .version('0.1.0');

program
  .command('init')
  .description('Create a paso.yaml template in the current directory')
  .option('-n, --name <name>', 'Service name')
  .action((opts) => {
    const outPath = resolve('paso.yaml');
    if (existsSync(outPath)) {
      console.error('paso.yaml already exists in this directory.');
      process.exit(1);
    }

    const name = opts.name || 'MyService';
    const template = `version: "1.0"

service:
  name: ${name}
  description: TODO — describe what your service does
  base_url: https://api.example.com
  auth:
    type: bearer

capabilities:
  - name: example_action
    description: TODO — describe what this action does
    method: GET
    path: /example
    permission: read
    inputs:
      id:
        type: string
        required: true
        description: TODO — describe this parameter
        in: query
    output:
      result:
        type: string
        description: TODO — describe the output

permissions:
  read:
    - example_action
`;

    writeFileSync(outPath, template, 'utf-8');
    console.log(`Created paso.yaml for "${name}"`);
    console.log('Edit the file to declare your API capabilities, then run: usepaso serve');
  });

program
  .command('validate')
  .description('Validate a paso.yaml file')
  .option('-f, --file <path>', 'Path to paso.yaml', 'paso.yaml')
  .action((opts) => {
    const filePath = resolve(opts.file);
    if (!existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }

    try {
      const decl = parseFile(filePath);
      const errors = validate(decl);

      if (errors.length === 0) {
        console.log(`${filePath} is valid.`);
        console.log(`Service: ${decl.service.name}`);
        console.log(`Capabilities: ${decl.capabilities.length}`);
      } else {
        console.error(`Found ${errors.length} error(s):`);
        for (const err of errors) {
          console.error(`  ${err.path}: ${err.message}`);
        }
        process.exit(1);
      }
    } catch (err) {
      console.error(`Failed to parse: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

program
  .command('serve')
  .description('Start an MCP server from a paso.yaml declaration')
  .option('-f, --file <path>', 'Path to paso.yaml', 'paso.yaml')
  .action(async (opts) => {
    const filePath = resolve(opts.file);
    if (!existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }

    try {
      const decl = parseFile(filePath);
      const errors = validate(decl);

      if (errors.length > 0) {
        console.error(`Validation failed with ${errors.length} error(s):`);
        for (const err of errors) {
          console.error(`  ${err.path}: ${err.message}`);
        }
        process.exit(1);
      }

      console.error(`Paso MCP server starting for "${decl.service.name}"...`);
      console.error(`Capabilities: ${decl.capabilities.length}`);
      console.error('Transport: stdio');
      console.error('Waiting for MCP client connection...');

      await serveMcp(decl);
    } catch (err) {
      console.error(`Failed to start: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

program.parse();
