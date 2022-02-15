import { getTableName } from './table-resolver';
import { ensureTable } from './table-creator';

// Lists all available migration versions, as a sorted array.
export function listAll(migrationSource, loadExtensions) {
  return migrationSource.getMigrations(loadExtensions);
}

// Lists all migrations that have been completed for the current db, as an
// array.
export async function listCompleted(tableName, schemaName, trxOrKnex) {
  await ensureTable(tableName, schemaName, trxOrKnex);

  return await trxOrKnex
    .from(getTableName(tableName, schemaName))
    .orderBy('id')
    .select('name');
}

// Gets the migration list from the migration directory specified in config, as well as
// the list of completed migrations to check what should be run.
export function listAllAndCompleted(config, trxOrKnex) {
  return Promise.all([
    listAll(config.migrationSource, config.loadExtensions),
    listCompleted(config.tableName, config.schemaName, trxOrKnex),
  ]);
}

