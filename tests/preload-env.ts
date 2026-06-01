/**
 * Runs before tests/setup.ts (see bunfig.toml). Must not import server code — logger and
 * Redis read LOG_LEVEL / NODE_ENV at module load time.
 */
if (process.env.LOG_LEVEL === undefined || process.env.LOG_LEVEL === '') {
  process.env.LOG_LEVEL = 'warn';
}

if (process.env.NODE_ENV === undefined || process.env.NODE_ENV === '') {
  process.env.NODE_ENV = 'test';
}
