import Client from '../client';
import QueryBuilder from '../query/querybuilder';
import QueryInterface from '../query/method-constants';

import makeKnex from './make-knex';
import { KnexTimeoutError } from '../util/timeout';
import { resolveConfig } from './internal/config-resolver';

export default function knex(config) {
  const { resolvedConfig, Dialect } = resolveConfig(...arguments);

  const newKnex = makeKnex(new Dialect(resolvedConfig));
  if (resolvedConfig.userParams) {
    newKnex.userParams = resolvedConfig.userParams;
  }
  return newKnex;
}

// Expose Client on the main Knex namespace.
knex.Client = Client;

knex.KnexTimeoutError = KnexTimeoutError;

knex.QueryBuilder = {
  extend: function (methodName: string, fn: Function) {
    QueryBuilder.extend(methodName, fn);
    QueryInterface.push(methodName);
  },
};
