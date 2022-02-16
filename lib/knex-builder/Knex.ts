export { default as Client } from '../client';
export { KnexTimeoutError } from '../util/timeout';

import { Config } from '../client';
import QueryBuilder from '../query/querybuilder';
import QueryInterface from '../query/method-constants';

import makeKnex from './make-knex';
import { resolveConfig } from './internal/config-resolver';

export default function knex(config: Config | string) {
  const { resolvedConfig, Dialect } = resolveConfig(config);

  const newKnex = makeKnex(new Dialect(resolvedConfig));
  if (resolvedConfig.userParams) {
    newKnex.userParams = resolvedConfig.userParams;
  }
  return newKnex;
}

knex.QueryBuilder = {
  extend: function (methodName: string, fn: Function) {
    QueryBuilder.extend(methodName, fn);
    QueryInterface.push(methodName);
  },
};
