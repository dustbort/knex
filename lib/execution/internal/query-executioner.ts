import Debug from 'debug';
import Client from '../../client';
import { Builder, Connection } from '../../types';
import { isString } from '../../util/is';

const _debugQuery = Debug('knex:query');
const debugBindings = Debug('knex:bindings');
const debugQuery = (sql: string, txId: string) => _debugQuery(sql.replace(/%/g, '%%'), txId);

export function formatQuery(sql, bindings, timeZone, client) {
  bindings = bindings == null ? [] : [].concat(bindings);
  let index = 0;
  return sql.replace(/\\?\?/g, (match) => {
    if (match === '\\?') {
      return '?';
    }
    if (index === bindings.length) {
      return match;
    }
    const value = bindings[index++];
    return client._escapeBinding(value, { timeZone });
  });
}

export function enrichQueryObject(connection, queryParam: string | Builder, client: Client) {
  const queryObject: Builder = 
    isString(queryParam) ? { sql: queryParam } : queryParam

  queryObject.bindings = client.prepBindings(queryObject.bindings);
  queryObject.sql = client.positionBindings(queryObject.sql);

  const { __knexUid, __knexTxId } = connection;

  client.emit('query', Object.assign({ __knexUid, __knexTxId }, queryObject));
  debugQuery(queryObject.sql, __knexTxId);
  debugBindings(queryObject.bindings, __knexTxId);

  return queryObject;
}

export function executeQuery(connection: Connection, queryObject: Builder, client: Client) {
  return client._query(connection, queryObject).catch((err) => {
    err.message =
      formatQuery(queryObject.sql, queryObject.bindings, undefined, client) +
      ' - ' +
      err.message;
    client.emit(
      'query-error',
      err,
      Object.assign(
        { __knexUid: connection.__knexUid, __knexTxId: connection.__knexUid },
        queryObject
      )
    );
    throw err;
  });
}

