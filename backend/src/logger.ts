/**
 * Tiny timestamped console logger — good enough for a hackathon service and
 * keeps output human-readable when multiple subsystems log concurrently.
 */
function stamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 23);
}

function line(scope: string, message: string): string {
  return `${stamp()} [${scope}] ${message}`;
}

export const logger = {
  info: (scope: string, message: string) => console.log(line(scope, message)),
  warn: (scope: string, message: string) => console.warn(line(scope, message)),
  error: (scope: string, message: string) => console.error(line(scope, message)),
  debug: (scope: string, message: string) => {
    if (process.env.NODE_ENV !== "production") console.debug(line(scope, message));
  },
};
