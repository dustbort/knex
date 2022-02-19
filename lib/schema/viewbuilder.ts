import * as helpers from '../util/helpers';
import extend from 'lodash/extend';
import Client from '../client';

export type ViewBuilderMethod = 'alter';
export type ViewBuilderViewName = string;
export type ViewBuilderFn = Function;

export default class ViewBuilder {
  client: Client;
  private _fn: unknown;
  private _method: ViewBuilderMethod;
  private _schemaName?: string;
  private _columns?: string[];
  private _viewName: unknown;
  private _statements: unknown[];
  private _single: unknown; 

  constructor(client: Client, method: ViewBuilderMethod, viewName: ViewBuilderViewName, fn: ViewBuilderFn) {
    this.client = client;
    this._method = method;
    this._schemaName = undefined;
    this._columns = undefined;
    this._fn = fn;
    this._viewName = viewName;
    this._statements = [];
    this._single = {};
  }

  setSchema(schemaName: string) {
    this._schemaName = schemaName;
  }

  columns(columns: string[]) {
    this._columns = columns;
  }

  as(selectQuery) {
    this._selectQuery = selectQuery;
  }

  checkOption() {
    throw new Error(
      'check option definition is not supported by this dialect.'
    );
  }

  localCheckOption() {
    throw new Error(
      'check option definition is not supported by this dialect.'
    );
  }

  cascadedCheckOption() {
    throw new Error(
      'check option definition is not supported by this dialect.'
    );
  }

  toSQL() {
    if (this._method === 'alter') {
      extend(this, AlterMethods);
    }
    this._fn.call(this, this);
    return this.client.viewCompiler(this).toSQL();
  }

  get queryContext() {
    return helpers.queryContext.bind(this);
  }
}

const AlterMethods = {
  column(column) {
    const self = this;
    return {
      rename: function (newName) {
        self._statements.push({
          grouping: 'alterView',
          method: 'renameColumn',
          args: [column, newName],
        });
        return this;
      },
      defaultTo: function (defaultValue) {
        self._statements.push({
          grouping: 'alterView',
          method: 'defaultTo',
          args: [column, defaultValue],
        });
        return this;
      },
    };
  },
};

