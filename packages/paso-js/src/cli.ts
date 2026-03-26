#!/usr/bin/env node

import { Command } from 'commander';
import { registerInit } from './commands/init';
import { registerValidate } from './commands/validate';
import { registerInspect } from './commands/inspect';
import { registerTest } from './commands/test';
import { registerServe } from './commands/serve';
import { registerDoctor } from './commands/doctor';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../package.json');

const program = new Command();
program.name('usepaso').description('Make your API agent-ready in minutes').version(version);

registerInit(program);
registerValidate(program);
registerInspect(program);
registerTest(program);
registerServe(program);
registerDoctor(program);

program
  .command('version')
  .description('Print the usepaso version')
  .action(() => {
    console.log(version);
  });

program
  .command('completion')
  .description('Output shell completion script')
  .option('--shell <shell>', 'Shell type (bash, zsh, fish)', 'bash')
  .action((opts) => {
    const commands = [
      'init',
      'validate',
      'inspect',
      'test',
      'serve',
      'doctor',
      'version',
      'completion',
    ];
    const cmds = commands.join(' ');
    if (opts.shell === 'zsh') {
      console.log(
        `#compdef usepaso\n_usepaso() {\n  local commands=(${cmds})\n  _describe 'command' commands\n}\ncompdef _usepaso usepaso`,
      );
    } else if (opts.shell === 'fish') {
      for (const cmd of commands) {
        console.log(`complete -c usepaso -n '__fish_use_subcommand' -a '${cmd}'`);
      }
    } else {
      // bash
      console.log(
        `_usepaso() {\n  local cur=\${COMP_WORDS[COMP_CWORD]}\n  COMPREPLY=( $(compgen -W "${cmds}" -- "$cur") )\n}\ncomplete -F _usepaso usepaso`,
      );
    }
  });

program.parse();
