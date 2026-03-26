#!/usr/bin/env python3

import click
from importlib.metadata import version as pkg_version

from usepaso.commands import init_cmd, validate_cmd, inspect_cmd, test_cmd, serve_cmd, doctor_cmd

try:
    __version__ = pkg_version('usepaso')
except Exception:
    __version__ = '0.0.0'


@click.group()
@click.version_option(version=__version__, prog_name='usepaso', message='%(version)s')
def main():
    """usepaso — Make your API agent-ready in minutes."""
    pass


init_cmd.register(main)
validate_cmd.register(main)
inspect_cmd.register(main)
test_cmd.register(main)
serve_cmd.register(main)
doctor_cmd.register(main)


@main.command()
def version():
    """Print the usepaso version."""
    click.echo(__version__)


@main.command()
@click.option('--shell', default='bash', type=click.Choice(['bash', 'zsh', 'fish']), help='Shell type')
def completion(shell):
    """Output shell completion script."""
    commands = ['init', 'validate', 'inspect', 'test', 'serve', 'doctor', 'version', 'completion']
    cmds = ' '.join(commands)
    if shell == 'zsh':
        click.echo(f'#compdef usepaso\n_usepaso() {{\n  local commands=({cmds})\n  _describe \'command\' commands\n}}\ncompdef _usepaso usepaso')
    elif shell == 'fish':
        for cmd in commands:
            click.echo(f"complete -c usepaso -n '__fish_use_subcommand' -a '{cmd}'")
    else:
        click.echo(f'_usepaso() {{\n  local cur=${{COMP_WORDS[COMP_CWORD]}}\n  COMPREPLY=( $(compgen -W "{cmds}" -- "$cur") )\n}}\ncomplete -F _usepaso usepaso')


if __name__ == '__main__':
    main()
