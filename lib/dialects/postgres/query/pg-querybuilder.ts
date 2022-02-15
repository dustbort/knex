import QueryBuilder from '../../../query/querybuilder.js';

export default class QueryBuilder_PostgreSQL extends QueryBuilder {
  using(tables) {
    this._single.using = tables;
    return this;
  }

  withMaterialized(alias, statementOrColumnList, nothingOrStatement) {
    this._validateWithArgs(
      alias,
      statementOrColumnList,
      nothingOrStatement,
      'with'
    );
    return this.withWrapped(
      alias,
      statementOrColumnList,
      nothingOrStatement,
      true
    );
  }

  withNotMaterialized(alias, statementOrColumnList, nothingOrStatement) {
    this._validateWithArgs(
      alias,
      statementOrColumnList,
      nothingOrStatement,
      'with'
    );
    return this.withWrapped(
      alias,
      statementOrColumnList,
      nothingOrStatement,
      false
    );
  }
};
