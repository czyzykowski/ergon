/**
 * Whether this run is Interactive: permitted to prompt or open an editor.
 *
 * Only when both stdin and stdout are terminals and `--non-interactive` was not
 * given. Both ends, because prompts read stdin but draw on stdout: a captured
 * `KEY=$(ergon new …)` would otherwise draw its prompt where nobody sees it.
 * Commands ask here rather than inspecting the terminal themselves — see
 * docs/adr/0014.
 */
export function isInteractive(
  options: { nonInteractive?: boolean } = {},
): boolean {
  return !options.nonInteractive && Deno.stdin.isTerminal() &&
    Deno.stdout.isTerminal();
}
