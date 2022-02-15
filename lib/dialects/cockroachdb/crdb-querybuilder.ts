import QueryBuilder from '../../query/querybuilder';
import isEmpty from 'lodash/isEmpty';

export default class QueryBuilder_CockroachDB extends QueryBuilder {
  upsert(values, returning, options) {
    this._method = 'upsert';
    if (!isEmpty(returning)) this.returning(returning, options);
    this._single.upsert = values;
    return this;
  }
};
