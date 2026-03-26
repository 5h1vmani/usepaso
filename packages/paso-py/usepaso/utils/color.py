"""
ANSI color utilities for CLI output.
Uses 24-bit true color (brand palette) when supported, falls back to standard ANSI.
Respects NO_COLOR env var (https://no-color.org/) and non-TTY stderr.

Brand colors from usepaso.dev/brand tokens.css:
  success: #4e916a (sage green)
  error:   #c5515c (muted red)
  warning: #c6813d (amber/rust)
  info:    #86bfcb (teal)
  muted:   #7a7773 (warm gray)
"""

import os
import sys


def _enabled():
    return 'NO_COLOR' not in os.environ and hasattr(sys.stderr, 'isatty') and sys.stderr.isatty()


def _true_color():
    if not _enabled():
        return False
    ct = os.environ.get('COLORTERM', '')
    tp = os.environ.get('TERM_PROGRAM', '')
    return ct in ('truecolor', '24bit') or tp in ('iTerm.app', 'vscode')


def _rgb(r: int, g: int, b: int, s: str) -> str:
    return f'\x1b[38;2;{r};{g};{b}m{s}\x1b[39m'


def _ansi(code: int, s: str) -> str:
    return f'\x1b[{code}m{s}\x1b[39m'


def green(s: str) -> str:
    """Brand: --color-success #4e916a"""
    if not _enabled():
        return s
    return _rgb(78, 145, 106, s) if _true_color() else _ansi(32, s)


def red(s: str) -> str:
    """Brand: --color-error #c5515c"""
    if not _enabled():
        return s
    return _rgb(197, 81, 92, s) if _true_color() else _ansi(31, s)


def yellow(s: str) -> str:
    """Brand: --color-warning #c6813d"""
    if not _enabled():
        return s
    return _rgb(198, 129, 61, s) if _true_color() else _ansi(33, s)


def cyan(s: str) -> str:
    """Brand: --teal-bright #86bfcb"""
    if not _enabled():
        return s
    return _rgb(134, 191, 203, s) if _true_color() else _ansi(36, s)


def dim(s: str) -> str:
    """Brand: --dark-text-muted #7a7773"""
    if not _enabled():
        return s
    if _true_color():
        return _rgb(122, 119, 115, s)
    return f'\x1b[2m{s}\x1b[22m'


def bold(s: str) -> str:
    if not _enabled():
        return s
    return f'\x1b[1m{s}\x1b[22m'
