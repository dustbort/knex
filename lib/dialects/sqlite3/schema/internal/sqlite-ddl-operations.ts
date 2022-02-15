export function copyData(sourceTable, targetTable, columns) {
  return `INSERT INTO "${targetTable}" SELECT ${
    columns === undefined
      ? '*'
      : columns.map((column) => `"${column}"`).join(', ')
  } FROM "${sourceTable}";`;
}

export function dropOriginal(tableName) {
  return `DROP TABLE "${tableName}"`;
}

export function renameTable(tableName, alteredName) {
  return `ALTER TABLE "${tableName}" RENAME TO "${alteredName}"`;
}

export function getTableSql(tableName) {
  return `SELECT type, sql FROM sqlite_master WHERE (type='table' OR (type='index' AND sql IS NOT NULL)) AND tbl_name='${tableName}'`;
}

export function isForeignCheckEnabled() {
  return `PRAGMA foreign_keys`;
}

export export function setForeignCheck(enable) {
  return `PRAGMA foreign_keys = ${enable ? 'ON' : 'OFF'}`;
}

export function executeForeignCheck() {
  return `PRAGMA foreign_key_check`;
}

