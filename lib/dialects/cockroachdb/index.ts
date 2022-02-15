// CockroachDB Client
// -------
import Client_PostgreSQL from '../postgres';
import Transaction from '../postgres/execution/pg-transaction';
import QueryCompiler from './crdb-querycompiler';
import TableCompiler from './crdb-tablecompiler';
import ViewCompiler from './crdb-viewcompiler';
import QueryBuilder from './crdb-querybuilder';

// Always initialize with the "QueryBuilder" and "QueryCompiler"
// objects, which extend the base 'lib/query/builder' and
// 'lib/query/compiler', respectively.
export default class Client_CockroachDB extends Client_PostgreSQL {
  transaction() {
    return new Transaction(this, ...arguments);
  }

  queryCompiler(builder, formatter) {
    return new QueryCompiler(this, builder, formatter);
  }

  tableCompiler() {
    return new TableCompiler(this, ...arguments);
  }

  viewCompiler() {
    return new ViewCompiler(this, ...arguments);
  }

  queryBuilder() {
    return new QueryBuilder(this);
  }

  _parseVersion(versionString) {
    return versionString.split(' ')[2];
  }

  async cancelQuery(connectionToKill) {
    try {
      return await this._wrappedCancelQueryCall(null, connectionToKill);
    } catch (err) {
      this.logger.warn(`Connection Error: ${err}`);
      throw err;
    }
  }

  _wrappedCancelQueryCall(emptyConnection, connectionToKill) {
    // FixMe https://github.com/cockroachdb/cockroach/issues/41335
    if (
      connectionToKill.activeQuery.processID === 0 &&
      connectionToKill.activeQuery.secretKey === 0
    ) {
      return;
    }

    return connectionToKill.cancel(
      connectionToKill,
      connectionToKill.activeQuery
    );
  }

  toArrayPathFromJsonPath(jsonPath, builder, bindingsHolder) {
    return jsonPath
      .replace(/^(\$\.)/, '') // remove the first dollar
      .replace(/\[([0-9]+)]/, '.$1')
      .split('.')
      .map(
        function (v) {
          return this.parameter(v, builder, bindingsHolder);
        }.bind(this)
      )
      .join(', ');
  }
}

Object.assign(Client_CockroachDB.prototype, {
  // The "dialect", for reference elsewhere.
  driverName: 'cockroachdb',
});
