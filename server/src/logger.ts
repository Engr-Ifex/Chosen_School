/**
 * Structured JSON logging, per docs/ARCHITECTURE.md §10.3.
 *
 * Deliberately hand-rolled rather than pulling in a logging library: the
 * requirement is small and specific — one JSON line per event, no request
 * bodies, no personal data. A library would need configuring to be this
 * careful, and configuration is easier to get wrong than thirty lines.
 *
 * Never pass a request body, a password, a session token, or a health note to
 * any of these methods. Fields are logged verbatim.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const SEVERITY: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  error(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  debug(message: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

function write(level: LogLevel, bindings: LogFields, message: string, fields?: LogFields): void {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg: message,
    ...bindings,
    ...fields,
  });

  // stdout for everything below error, so error lines can be filtered separately
  // by a log collector without also catching ordinary output.
  if (level === 'error') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export function createLogger(level: LogLevel = 'info', bindings: LogFields = {}): Logger {
  const threshold = SEVERITY[level];

  const at =
    (l: LogLevel) =>
    (message: string, fields?: LogFields): void => {
      if (SEVERITY[l] <= threshold) write(l, bindings, message, fields);
    };

  return {
    error: at('error'),
    warn: at('warn'),
    info: at('info'),
    debug: at('debug'),
    child: (extra: LogFields) => createLogger(level, { ...bindings, ...extra }),
  };
}

/**
 * Replaces identifier-looking path segments so a request log does not become a
 * record of which child was viewed. Applied before logging, never to routing.
 */
export function redactPath(path: string): string {
  return path
    .split('/')
    .map((segment) =>
      /^[0-9a-f]{24}$/i.test(segment) || // ObjectId
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) // UUID
        ? ':id'
        : segment,
    )
    .join('/');
}
