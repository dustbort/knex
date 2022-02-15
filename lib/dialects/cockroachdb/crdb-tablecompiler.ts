/* eslint max-len: 0 */

import TableCompiler from '../postgres/schema/pg-tablecompiler';

export default class TableCompiler_CRDB extends TableCompiler {
  constructor(client, tableBuilder) {
    super(client, tableBuilder);
  }

  addColumns(columns, prefix, colCompilers) {
    if (prefix === this.alterColumnsPrefix) {
      // alter columns
      for (const col of colCompilers) {
        this.client.logger.warn(
          'Experimental alter column in use, see issue: https://github.com/cockroachdb/cockroach/issues/49329'
        );
        this.pushQuery({
          sql: 'SET enable_experimental_alter_column_type_general = true',
          bindings: [],
        });
        super._addColumn(col);
      }
    } else {
      // base class implementation for normal add
      super.addColumns(columns, prefix);
    }
  }

  dropUnique(columns, indexName) {
    indexName = indexName
      ? this.formatter.wrap(indexName)
      : this._indexCommand('unique', this.tableNameRaw, columns);
    this.pushQuery(`drop index ${this.tableName()}@${indexName} cascade `);
  }
}
