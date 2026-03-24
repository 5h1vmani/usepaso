import { Command } from 'commander';
import { resolve } from 'path';
import { loadAndValidate } from './shared';

export function registerValidate(program: Command): void {
  program
    .command('validate')
    .description('Validate a usepaso.yaml file')
    .option('-f, --file <path>', 'Path to usepaso.yaml', 'usepaso.yaml')
    .action((opts) => {
      const decl = loadAndValidate(resolve(opts.file));
      console.log(`valid (${decl.service.name}, ${decl.capabilities.length} capabilities)`);
    });
}
