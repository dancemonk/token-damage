// The parent environment for a spawned CLI, minus colour settings from the developer's terminal: with FORCE_COLOR
// and NO_COLOR both set, Node prints a warning to stderr, and tests compare stderr exactly.
export function parentEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.FORCE_COLOR;
  return env;
}
