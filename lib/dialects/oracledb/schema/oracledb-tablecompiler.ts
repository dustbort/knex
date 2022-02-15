import TableCompiler_Oracle from '../../oracle/schema/oracle-tablecompiler';

export default class TableCompiler_Oracledb extends TableCompiler_Oracle {
  constructor(client, tableBuilder) {
    super(client, tableBuilder);
  }

  _setNullableState(column, isNullable) {
    const nullability = isNullable ? 'NULL' : 'NOT NULL';
    const sql = `alter table ${this.tableName()} modify (${this.formatter.wrap(
      column
    )} ${nullability})`;
    return this.pushQuery({
      sql: sql,
    });
  }
}
