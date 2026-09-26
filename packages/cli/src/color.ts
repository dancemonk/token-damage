/**
 * Colour for a terminal, or for a pipe when FORCE_COLOR asks (FORCE_COLOR=0 turns it off). NO_COLOR and TERM=dumb
 * win over both.
 */
export function wantColor(
  tty: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NO_COLOR || env.TERM === "dumb" || env.FORCE_COLOR === "0")
    return false;
  return tty || env.FORCE_COLOR !== undefined;
}
