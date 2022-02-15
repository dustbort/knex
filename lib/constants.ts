// The client names we'll allow in the `{name: lib}` pairing.
export const CLIENT_ALIASES = Object.freeze({
  pg: 'postgres',
  postgresql: 'postgres',
  sqlite: 'sqlite3',
} as const);

export const SUPPORTED_CLIENTS = Object.freeze([
  'mssql',
  'mysql',
  'mysql2',
  'oracledb',
  'postgres',
  'pgnative',
  'redshift',
  'sqlite3',
  'cockroachdb',
  'better-sqlite3',
  ...Object.keys(CLIENT_ALIASES) as (keyof typeof CLIENT_ALIASES)[],
] as const);

export const DRIVER_NAMES = Object.freeze({
  MsSQL: 'mssql',
  MySQL: 'mysql',
  MySQL2: 'mysql2',
  Oracle: 'oracledb',
  PostgreSQL: 'pg',
  PgNative: 'pgnative',
  Redshift: 'pg-redshift',
  SQLite: 'sqlite3',
  CockroachDB: 'cockroachdb',
  BetterSQLite3: 'better-sqlite3',
} as const);

export const POOL_CONFIG_OPTIONS = Object.freeze([
  'maxWaitingClients',
  'testOnBorrow',
  'fifo',
  'priorityRange',
  'autostart',
  'evictionRunIntervalMillis',
  'numTestsPerRun',
  'softIdleTimeoutMillis',
  'Promise',
] as const);

/**
 * Regex that only matches comma's in strings that aren't wrapped in parentheses. Can be used to
 * safely split strings like `id int, name string, body text, primary key (id, name)` into definition
 * rows
 */
export const COMMA_NO_PAREN_REGEX = /,[\s](?![^(]*\))/g;

