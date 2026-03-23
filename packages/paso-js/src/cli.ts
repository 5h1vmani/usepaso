#!/usr/bin/env node

import { Command } from 'commander';
import { registerInit } from './commands/init';
import { registerValidate } from './commands/validate';
import { registerInspect } from './commands/inspect';
import { registerTest } from './commands/test';
import { registerServe } from './commands/serve';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../package.json');

const program = new Command();
program.name('usepaso').description('Make your API agent-ready in minutes').version(version);

registerInit(program);
registerValidate(program);
registerInspect(program);
registerTest(program);
registerServe(program);

program.parse();
