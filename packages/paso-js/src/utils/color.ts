/**
 * ANSI color utilities for CLI output.
 * Uses 24-bit true color (brand palette) when supported, falls back to standard ANSI.
 * Respects NO_COLOR env var (https://no-color.org/) and non-TTY stderr.
 *
 * Brand colors from usepaso.dev/brand tokens.css:
 *   success: #4e916a (sage green)
 *   error:   #c5515c (muted red)
 *   warning: #c6813d (amber/rust)
 *   info:    #86bfcb (teal)
 *   muted:   #7a7773 (warm gray)
 */

const enabled = !process.env.NO_COLOR && process.stderr.isTTY !== false;

const trueColor =
  enabled &&
  (process.env.COLORTERM === 'truecolor' ||
    process.env.COLORTERM === '24bit' ||
    process.env.TERM_PROGRAM === 'iTerm.app' ||
    process.env.TERM_PROGRAM === 'vscode');

function rgb(r: number, g: number, b: number) {
  if (!enabled) return (s: string) => s;
  if (trueColor) return (s: string) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`;
  // Fall through to caller's ANSI fallback
  return null;
}

function ansi(open: number, close: number) {
  if (!enabled) return (s: string) => s;
  return (s: string) => `\x1b[${open}m${s}\x1b[${close}m`;
}

// Brand: --color-success #4e916a
export const green = rgb(78, 145, 106) ?? ansi(32, 39);

// Brand: --color-error #c5515c
export const red = rgb(197, 81, 92) ?? ansi(31, 39);

// Brand: --color-warning #c6813d
export const yellow = rgb(198, 129, 61) ?? ansi(33, 39);

// Brand: --teal-bright #86bfcb
export const cyan = rgb(134, 191, 203) ?? ansi(36, 39);

// Brand: --dark-text-muted #7a7773
export const dim = rgb(122, 119, 115) ?? ansi(2, 22);

export const bold = ansi(1, 22);
