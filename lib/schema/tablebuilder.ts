// TableBuilder

// Takes the function passed to the "createTable" or "table/editTable"
// functions and calls it with the "TableBuilder" as both the context and
// the first argument. Inside this function we can specify what happens to the
// method, pushing everything we want to do onto the "allStatements" array,
// which is then compiled into sql.
// ------
import each from 'lodash/each';
import extend from 'lodash/extend';
import toArray from 'lodash/toArray';
import Client from '../client';
import * as helpers from '../util/helpers';
import { isString, isFunction, isObject } from '../util/is';

// TODO: infer types
export type TableBuilderMethod = 'alter'
export type TableBuilderTableName = 'string';
export type TableBuilderTableNameLike = 'string';
export type TableBuilderFn = (tableBuilder: TableBuilder) => void;

export default class TableBuilder {
  client: Client;
  private _fn: TableBuilderFn;
  private _method: TableBuilderMethod;
  private _schemaName?: string = undefined;
  private _tableName: unknown;
  private _tableNameLike: unknown;
  private _statements: {
    grouping: 'alterTable',
    method: unknown,
    args: any[]
  }[] = [];
  private _single: unknown = {};
  private _queryContext: unknown;

  constructor(client: Client, method: TableBuilderMethod, tableName: TableBuilderTableName, tableNameLike: TableBuilderTableNameLike, fn: TableBuilderFn) {
    this.client = client;
    this._fn = fn;
    this._method = method;
    this._tableName = tableName;
    this._tableNameLike = tableNameLike;

    if (!tableNameLike && !isFunction(this._fn)) {
      throw new TypeError(
        'A callback function must be supplied to calls against `.createTable` ' +
          'and `.table`'
      );
    }
  }

  setSchema(schemaName: string) {
    this._schemaName = schemaName;
  }

  // Convert the current tableBuilder object "toSQL"
  // giving us additional methods if we're altering
  // rather than creating the table.
  toSQL() {
    if (this._method === 'alter') {
      extend(this, AlterMethods);
    }
    // With 'create table ... like' callback function is useless.
    if (this._fn) {
      this._fn.call(this, this);
    }
    return this.client.tableCompiler(this).toSQL();
  }

  // The "timestamps" call is really just sets the `created_at` and `updated_at` columns.

  timestamps(useTimestamps, defaultToNow, useCamelCase) {
    if (isObject(useTimestamps)) {
      ({ useTimestamps, defaultToNow, useCamelCase } = useTimestamps);
    }
    const method = useTimestamps === true ? 'timestamp' : 'datetime';
    const createdAt = this[method](useCamelCase ? 'createdAt' : 'created_at');
    const updatedAt = this[method](useCamelCase ? 'updatedAt' : 'updated_at');

    if (defaultToNow === true) {
      const now = this.client.raw('CURRENT_TIMESTAMP');
      createdAt.notNullable().defaultTo(now);
      updatedAt.notNullable().defaultTo(now);
    }
  }

  // Set the comment value for a table, they're only allowed to be called
  // once per table.
  comment(value) {
    if (typeof value !== 'string') {
      throw new TypeError('Table comment must be string');
    }
    this._single.comment = value;
  }

  // Set a foreign key on the table, calling
  // `table.foreign('column_name').references('column').on('table').onDelete()...
  // Also called from the ColumnBuilder context when chaining.
  foreign(column, keyName) {
    const foreignData = { column: column, keyName: keyName };
    this._statements.push({
      grouping: 'alterTable',
      method: 'foreign',
      args: [foreignData],
    });
    let returnObj = {
      references(tableColumn) {
        let pieces;
        if (isString(tableColumn)) {
          pieces = tableColumn.split('.');
        }
        if (!pieces || pieces.length === 1) {
          foreignData.references = pieces ? pieces[0] : tableColumn;
          return {
            on(tableName) {
              if (typeof tableName !== 'string') {
                throw new TypeError(
                  `Expected tableName to be a string, got: ${typeof tableName}`
                );
              }
              foreignData.inTable = tableName;
              return returnObj;
            },
            inTable() {
              return this.on.apply(this, arguments);
            },
          };
        }
        foreignData.inTable = pieces[0];
        foreignData.references = pieces[1];
        return returnObj;
      },
      withKeyName(keyName) {
        foreignData.keyName = keyName;
        return returnObj;
      },
      onUpdate(statement) {
        foreignData.onUpdate = statement;
        return returnObj;
      },
      onDelete(statement) {
        foreignData.onDelete = statement;
        return returnObj;
      },
      deferrable: (type) => {
        const unSupported = [
          'mysql',
          'mssql',
          'redshift',
          'mysql2',
          'oracledb',
        ];
        if (unSupported.indexOf(this.client.dialect) !== -1) {
          throw new Error(`${this.client.dialect} does not support deferrable`);
        }
        foreignData.deferrable = type;
        return returnObj;
      },
      _columnBuilder(builder) {
        extend(builder, returnObj);
        returnObj = builder;
        return builder;
      },
    };
    return returnObj;
  }

  check(checkPredicate, bindings, constraintName) {
    this._statements.push({
      grouping: 'checks',
      args: [checkPredicate, bindings, constraintName],
    });
    return this;
  }

  //#region indexes
  private idx(method: unknown) {
    return (...args: any[]) => {
      this._statements.push({
        grouping: 'alterTable',
        method,
        args
      })
      return this;
    }
  }

  get index() {
    return this.idx('index').bind(this);
  }
  get primary() {
    return this.idx('primary').bind(this);
  }
  get unique() {
    return this.idx('unique').bind(this);
  }
  get dropPrimary() {
    return this.idx('dropPrimary').bind(this);
  }
  get dropUnique() {
    return this.idx('dropUnique').bind(this);
  }
  get dropIndex() {
    return this.idx('dropIndex').bind(this);
  }
  get dropForeign() {
    return this.idx('dropForeign').bind(this);
  }
  //#endregion indexes

  //#region dialect-specific table methods
  private tab(dialect: string, method: string, ) {
    if (this.client.dialect !== dialect) {
      throw new Error(
        `Knex only supports ${method} statement with ${dialect}.`
      );
    }
    if (this._method === 'alter') {
      throw new Error(
        `Knex does not support altering the ${method} outside of create ` +
          `table, please use knex.raw statement.`
      );
    }
    this._single[method] = value;
  }
  engine(value: string) {
    this.tab('mysql', 'engine');
  }
  charset(value: string) {
    this.tab('mysql', 'charset');
  }
  collate(value: string) {
    this.tab('mysql', 'collate');
  }
  inherits(value: string) {
    this.tab('postgresql', 'inherits');
  }
  //#endriong dialect-specific table methods

  //#region query context
  queryContext(context) {
    if (typeof context === "undefined") {
      return this._queryContext;
    }
    this._queryContext = context;
    return this;
  }
  //#end region query context


  //#region column types
  private col(type: string) {
    return (...args: any[]) => {
      const builder = this.client.columnBuilder(this, type, args);
      this._statements.push({
        grouping: 'columns',
        builder
      });
      return builder;
    }
  }

  get tinyint() {
    return this.col('tinyint').bind(this);
  }
  get smallint() {
    return this.col('smallint').bind(this);
  }
  get mediumint() {
    return this.col('mediumint').bind(this);
  }
  get int() {
    return this.col('int').bind(this);
  }
  get bigint() {
    return this.col('bigint').bind(this);
  }
  get decimal() {
    return this.col('decimal').bind(this);
  }
  get float() {
    return this.col('float').bind(this);
  }
  get double () {
    return this.col('double').bind(this);
  }
  get real() {
    return this.col('real').bind(this);
  }
  get bit() {
    return this.col('bit').bind(this);
  }
  get boolean() {
    return this.col('boolean').bind(this);
  }
  get serial() {
    return this.col('serial').bind(this);
  }
  get date() {
    return this.col('date').bind(this);
  }
  get datetime() {
    return this.col('datetime').bind(this);
  }
  get timestamp() {
    return this.col('timestamp').bind(this);
  }
  get time() {
    return this.col('time').bind(this);
  }
  get year() {
    return this.col('year').bind(this);
  }
  get geometry() {
    return this.col('geometry').bind(this);
  }
  get geography() {
    return this.col('geography').bind(this);
  }
  get point() {
    return this.col('point').bind(this);
  }
  get char() {
    return this.col('char').bind(this);
  }
  get varchar() {
    return this.col('varchar').bind(this);
  }
  get tinytext() {
    return this.col('tinytext').bind(this);
  }
  get tinyText() {
    return this.col('tinyText').bind(this);
  }
  get text() {
    return this.col('text').bind(this);
  }
  get mediumtext() {
    return this.col('mediumtext').bind(this);
  }
  get mediumText() {
    return this.col('mediumText').bind(this);
  }
  get longtext() {
    return this.col('longtext').bind(this);
  }
  get longText() {
    return this.col('longText').bind(this);
  }
  get binary() {
    return this.col('binary').bind(this);
  }
  get varbinary() {
    return this.col('varbinary').bind(this);
  }
  get tinyblob() {
    return this.col('tinyblob').bind(this);
  }
  get tinyBlob() {
    return this.col('tinyBlob').bind(this);
  }
  get mediumblob() {
    return this.col('mediumblob').bind(this);
  }
  get mediumBlob() {
    return this.col('mediumBlob').bind(this);
  }
  get blob() {
    return this.col('blob').bind(this);
  }
  get longblob() {
    return this.col('longblob').bind(this);
  }
  get longBlob() {
    return this.col('longBlob').bind(this);
  }
  get enum() {
    return this.col('enum').bind(this);
  }
  get set() {
    return this.col('set').bind(this);
  }
  get bool() {
    return this.col('bool').bind(this);
  }
  get dateTime() {
    return this.col('dateTime').bind(this);
  }
  get increments() {
    return this.col('increments').bind(this);
  }
  get bigincrements() {
    return this.col('bigincrements').bind(this);
  }
  get bigIncrements() {
    return this.col('bigIncrements').bind(this);
  }
  get integer() {
    return this.col('integer').bind(this);
  }
  get biginteger() {
    return this.col('biginteger').bind(this);
  }
  get bigInteger() {
    return this.col('bigInteger').bind(this);
  }
  get string() {
    return this.col('string').bind(this);
  }
  get json() {
    return this.col('json').bind(this);
  }
  get jsonb() {
    return this.col('jsonb').bind(this);
  }
  get uuid() {
    return this.col('uuid').bind(this);
  }
  get enu() {
    return this.col('enu').bind(this);
  }
  get specificType() {
    return this.col('specificType').bind(this);
  }
  //#endregion column types

}

// [
//   // Each of the index methods can be called individually, with the
//   // column name to be used, e.g. table.unique('column').
//   'index',
//   'primary',
//   'unique',

//   // Key specific
//   'dropPrimary',
//   'dropUnique',
//   'dropIndex',
//   'dropForeign',
// ].forEach((method) => {
//   TableBuilder.prototype[method] = function () {
//     this._statements.push({
//       grouping: 'alterTable',
//       method,
//       args: toArray(arguments),
//     });
//     return this;
//   };
// });

// // Warn for dialect-specific table methods, since that's the
// // only time these are supported.
// const specialMethods = {
//   mysql: ['engine', 'charset', 'collate'],
//   postgresql: ['inherits'],
// };
// each(specialMethods, function (methods, dialect) {
//   methods.forEach(function (method) {
//     TableBuilder.prototype[method] = function (value) {
//       if (this.client.dialect !== dialect) {
//         throw new Error(
//           `Knex only supports ${method} statement with ${dialect}.`
//         );
//       }
//       if (this._method === 'alter') {
//         throw new Error(
//           `Knex does not support altering the ${method} outside of create ` +
//             `table, please use knex.raw statement.`
//         );
//       }
//       this._single[method] = value;
//     };
//   });
// });

// helpers.addQueryContext(TableBuilder);

// // Each of the column types that we can add, we create a new ColumnBuilder
// // instance and push it onto the statements array.
// const columnTypes = [
//   // Numeric
//   'tinyint',
//   'smallint',
//   'mediumint',
//   'int',
//   'bigint',
//   'decimal',
//   'float',
//   'double',
//   'real',
//   'bit',
//   'boolean',
//   'serial',

//   // Date / Time
//   'date',
//   'datetime',
//   'timestamp',
//   'time',
//   'year',

//   // Geometry
//   'geometry',
//   'geography',
//   'point',

//   // String
//   'char',
//   'varchar',
//   'tinytext',
//   'tinyText',
//   'text',
//   'mediumtext',
//   'mediumText',
//   'longtext',
//   'longText',
//   'binary',
//   'varbinary',
//   'tinyblob',
//   'tinyBlob',
//   'mediumblob',
//   'mediumBlob',
//   'blob',
//   'longblob',
//   'longBlob',
//   'enum',
//   'set',

//   // Increments, Aliases, and Additional
//   'bool',
//   'dateTime',
//   'increments',
//   'bigincrements',
//   'bigIncrements',
//   'integer',
//   'biginteger',
//   'bigInteger',
//   'string',
//   'json',
//   'jsonb',
//   'uuid',
//   'enu',
//   'specificType',
// ];

// // For each of the column methods, create a new "ColumnBuilder" interface,
// // push it onto the "allStatements" stack, and then return the interface,
// // with which we can add indexes, etc.
// columnTypes.forEach((type) => {
//   TableBuilder.prototype[type] = function () {
//     const args = toArray(arguments);
//     const builder = this.client.columnBuilder(this, type, args);
//     this._statements.push({
//       grouping: 'columns',
//       builder,
//     });
//     return builder;
//   };
// });

const AlterMethods = {
  // Renames the current column `from` the current
  // TODO: this.column(from).rename(to)
  renameColumn(from, to) {
    this._statements.push({
      grouping: 'alterTable',
      method: 'renameColumn',
      args: [from, to],
    });
    return this;
  },

  dropTimestamps() {
    // arguments[0] = useCamelCase
    return this.dropColumns(
      arguments[0] === true
        ? ['createdAt', 'updatedAt']
        : ['created_at', 'updated_at']
    );
  },

  setNullable(column) {
    this._statements.push({
      grouping: 'alterTable',
      method: 'setNullable',
      args: [column],
    });

    return this;
  },

  check(checkPredicate, bindings, constraintName) {
    this._statements.push({
      grouping: 'alterTable',
      method: 'check',
      args: [checkPredicate, bindings, constraintName],
    });
  },

  dropChecks() {
    this._statements.push({
      grouping: 'alterTable',
      method: 'dropChecks',
      args: toArray(arguments),
    });
  },

  dropNullable(column) {
    this._statements.push({
      grouping: 'alterTable',
      method: 'dropNullable',
      args: [column],
    });

    return this;
  },

  // TODO: changeType
};

// Drop a column from the current table.
// TODO: Enable this.column(columnName).drop();
AlterMethods.dropColumn = AlterMethods.dropColumns = function () {
  this._statements.push({
    grouping: 'alterTable',
    method: 'dropColumn',
    args: toArray(arguments),
  });
  return this;
};
