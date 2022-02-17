import { EventEmitter } from 'events';
import merge from 'lodash/merge';
import Client from '../client';
import batchInsert from '../execution/batch-insert';
import Transaction from '../execution/transaction';
import { Migrator } from '../migrations/migrate/Migrator';
import Seeder from '../migrations/seed/Seeder';
import Builder from '../query/querybuilder';
import { isObject } from '../util/is';
import FunctionHelper from './FunctionHelper';

type FunctionKeys<T> = {
  [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];
const bind = <T, K extends FunctionKeys<T>>(t: T, k: K): T[K] =>
  (t[k] as unknown as Function).bind(t);

type NotFunction<T> = {
  [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];
type OmitNotFunction<T> = Omit<T, NotFunction<T>>;

class KnexContext {
  client: Client;
  userParams: Record<string, any> = {};

  constructor(client: Client) {
    this.client = client;
  }

  get queryBuilder() {
    return bind(this.client, 'queryBuilder');
  }

  get raw() {
    return bind(this.client, 'raw');
  }

  batchInsert(table, batch, chunkSize = 1000) {
    return batchInsert(this, table, batch, chunkSize);
  }

  // Internal method that actually establishes the Transaction.  It makes no assumptions
  // about the `config` or `outerTx`, and expects the caller to handle these details.
  private _transaction(container, config, outerTx = null) {
    if (container) {
      return this.client.transaction(container, config, outerTx);
    } else {
      return new Promise((resolve, reject) => {
        this.client.transaction(resolve, config, outerTx).catch(reject);
      });
    }
  }

  // Creates a new transaction.
  // If container is provided, returns a promise for when the transaction is resolved.
  // If container is not provided, returns a promise with a transaction that is resolved
  // when transaction is ready to be used.
  transaction(config): Transaction | Promise<unknown>;
  transaction(container, config): Transaction | Promise<unknown>;
  transaction(container, _config?) {
    // Overload support of `transaction(config)`
    if (!_config && isObject(container)) {
      _config = container;
      container = null;
    }

    const config = {
      ..._config,
      userParams: this.userParams,
      doNotRejectOnRollback: _config.doNotRejectOnRollback ?? true,
    };

    return this._transaction(container, config);
  }

  transactionProvider(config) {
    let trx: Transaction | Promise<unknown>;
    return () => (trx ??= this.transaction(undefined, config));
  }

  // Typically never needed, initializes the pool for a knex client.
  initialize(config) {
    return this.client.initializePool(config);
  }

  // Convenience method for tearing down the pool.
  destroy(callback) {
    return this.client.destroy(callback);
  }

  ref(ref) {
    return this.client.ref(ref);
  }

  // Do not document this as public API until naming and API is improved for general consumption
  // This method exists to disable processing of internal queries in migrations
  disableProcessing() {
    if (this.userParams.isProcessingDisabled) {
      return;
    }
    this.userParams.wrapIdentifier = this.client.config.wrapIdentifier;
    this.userParams.postProcessResponse =
      this.client.config.postProcessResponse;
    this.client.config.wrapIdentifier = null;
    this.client.config.postProcessResponse = null;
    this.userParams.isProcessingDisabled = true;
  }

  // Do not document this as public API until naming and API is improved for general consumption
  // This method exists to enable execution of non-internal queries with consistent identifier naming in migrations
  enableProcessing() {
    if (!this.userParams.isProcessingDisabled) {
      return;
    }
    this.client.config.wrapIdentifier = this.userParams.wrapIdentifier;
    this.client.config.postProcessResponse =
      this.userParams.postProcessResponse;
    this.userParams.isProcessingDisabled = false;
  }
}

class KnexFacade<E = {}> extends EventEmitter {
  extensions: Record<string, Function> = {};

  constructor(private context: KnexContext) {
    super();

    this.addInternalListener('start', (obj) => {
      this.emit('start', obj);
    });
    this.addInternalListener('query', (obj) => {
      this.emit('query', obj);
    });
    this.addInternalListener('query-error', (err, obj) => {
      this.emit('query-error', err, obj);
    });
    this.addInternalListener('query-response', (response, obj, builder) => {
      this.emit('query-response', response, obj, builder);
    });

    const proxy: this = new Proxy(this, {
      apply: (target, thisArg, [tableName, options]) =>
        target.createQueryBuilder(tableName, options),
      get: (target, key: any) => {
        if (key in this.extensions) {
          return this.extensions[key].bind(this.queryBuilder());
        } else {
          const val = (target as any)[key];
          if (typeof val === 'function') {
            return val.bind(proxy);
          } else {
            return val;
          }
        }
      },
    });
    return proxy;
  }

  private createQueryBuilder(tableName: string, options) {
    const qb = this.queryBuilder();
    if (!tableName)
      this.client.logger.warn(
        'calling knex without a tableName is deprecated. Use knex.queryBuilder() instead.'
      );
    return tableName ? qb.table(tableName, options) : qb;
  }

  /**
   * @deprecated Use the `extend` method directly on the `knex` facade instance
   */
  get QueryBuilder() {
    return this;
  }

  extend<M extends string, T extends any[], U>(
    methodName: M,
    fn?: (...args: T) => U
  ): KnexFacade<OmitNotFunction<E & { [K in M]: (...args: T) => U }>>;
  extend<M extends { [x: string]: Function | undefined }>(
    methods: M
  ): KnexFacade<OmitNotFunction<E & M>>;
  extend(
    method: string | { [x: string]: Function | undefined },
    fn?: Function
  ) {
    const methods = typeof method === 'string' ? { [method]: fn } : method;
    for (const methodName of Object.keys(methods)) {
      if (methodName in this || methodName in this.queryBuilder()) {
        throw new Error(
          `Cannot extend with existing method ('${methodName}').`
        );
      }
    }
    for (const [methodName, fn] of Object.entries(methods)) {
      if (!fn) delete this.extensions[methodName];
      else this.extensions[methodName] = fn;
    }
    return this;
  }

  get client() {
    return this.context.client;
  }
  set client(client) {
    this.context.client = client;
  }

  get userParams() {
    return this.context.userParams;
  }
  set userParams(userParams) {
    this.context.userParams = userParams;
  }

  get schema() {
    return this.client.schemaBuilder();
  }

  get migrate() {
    return new Migrator(this);
  }

  get seed() {
    return new Seeder(this);
  }

  get fn() {
    return new FunctionHelper(this.client);
  }

  //#region context forwards
  queryBuilder(): Builder<E> {
    const proxy: Builder<E> = new Proxy(this.context.queryBuilder(), {
      get: (target, key: any) => {
        if (key in this.extensions) {
          return this.extensions[key].bind(proxy);
        } else {
          const val = (target as any)[key];
          if (typeof val === 'function') {
            return val.bind(proxy);
          } else {
            return val;
          }
        }
      },
    });
    return proxy;
  }
  get raw() {
    return bind(this.context, 'raw');
  }
  get batchInsert() {
    return bind(this.context, 'batchInsert');
  }
  get transaction() {
    return bind(this.context, 'transaction');
  }
  get transactionProvider() {
    return bind(this.context, 'transactionProvider');
  }
  get initialize() {
    return bind(this.context, 'initialize');
  }
  get destroy() {
    return bind(this.context, 'destroy');
  }
  get ref() {
    return bind(this.context, 'ref');
  }
  get disableProcessing() {
    return bind(this.context, 'disableProcessing');
  }
  get enableProcessing() {
    return bind(this.context, 'enableProcessing');
  }
  //#endregion context fowards

  //#region query builder forwards
  get with() {
    return bind(this.queryBuilder(), 'with');
  }
  get withRecursive() {
    return bind(this.queryBuilder(), 'withRecursive');
  }
  get withMaterialized() {
    return bind(this.queryBuilder(), 'withMaterialized');
  }
  get withNotMaterialized() {
    return bind(this.queryBuilder(), 'withNotMaterialized');
  }
  get select() {
    return bind(this.queryBuilder(), 'select');
  }
  get as() {
    return bind(this.queryBuilder(), 'as');
  }
  get columns() {
    return bind(this.queryBuilder(), 'columns');
  }
  get column() {
    return bind(this.queryBuilder(), 'column');
  }
  get from() {
    return bind(this.queryBuilder(), 'from');
  }
  get fromJS() {
    return bind(this.queryBuilder(), 'fromJS');
  }
  get fromRaw() {
    return bind(this.queryBuilder(), 'fromRaw');
  }
  get into() {
    return bind(this.queryBuilder(), 'into');
  }
  get withSchema() {
    return bind(this.queryBuilder(), 'withSchema');
  }
  get table() {
    return bind(this.queryBuilder(), 'table');
  }
  get distinct() {
    return bind(this.queryBuilder(), 'distinct');
  }
  get join() {
    return bind(this.queryBuilder(), 'join');
  }
  get joinRaw() {
    return bind(this.queryBuilder(), 'joinRaw');
  }
  get innerJoin() {
    return bind(this.queryBuilder(), 'innerJoin');
  }
  get leftJoin() {
    return bind(this.queryBuilder(), 'leftJoin');
  }
  get leftOuterJoin() {
    return bind(this.queryBuilder(), 'leftOuterJoin');
  }
  get rightJoin() {
    return bind(this.queryBuilder(), 'rightJoin');
  }
  get rightOuterJoin() {
    return bind(this.queryBuilder(), 'rightOuterJoin');
  }
  get outerJoin() {
    return bind(this.queryBuilder(), 'outerJoin');
  }
  get fullOuterJoin() {
    return bind(this.queryBuilder(), 'fullOuterJoin');
  }
  get crossJoin() {
    return bind(this.queryBuilder(), 'crossJoin');
  }
  get where() {
    return bind(this.queryBuilder(), 'where');
  }
  get whereLike() {
    return bind(this.queryBuilder(), 'whereLike');
  }
  get whereILike() {
    return bind(this.queryBuilder(), 'whereILike');
  }
  get andWhere() {
    return bind(this.queryBuilder(), 'andWhere');
  }
  get orWhere() {
    return bind(this.queryBuilder(), 'orWhere');
  }
  get whereNot() {
    return bind(this.queryBuilder(), 'whereNot');
  }
  get orWhereNot() {
    return bind(this.queryBuilder(), 'orWhereNot');
  }
  get whereRaw() {
    return bind(this.queryBuilder(), 'whereRaw');
  }
  get whereWrapped() {
    return bind(this.queryBuilder(), 'whereWrapped');
  }
  get havingWrapped() {
    return bind(this.queryBuilder(), 'havingWrapped');
  }
  get orWhereRaw() {
    return bind(this.queryBuilder(), 'orWhereRaw');
  }
  get whereExists() {
    return bind(this.queryBuilder(), 'whereExists');
  }
  get orWhereExists() {
    return bind(this.queryBuilder(), 'orWhereExists');
  }
  get whereNotExists() {
    return bind(this.queryBuilder(), 'whereNotExists');
  }
  get orWhereNotExists() {
    return bind(this.queryBuilder(), 'orWhereNotExists');
  }
  get whereIn() {
    return bind(this.queryBuilder(), 'whereIn');
  }
  get orWhereIn() {
    return bind(this.queryBuilder(), 'orWhereIn');
  }
  get whereNotIn() {
    return bind(this.queryBuilder(), 'whereNotIn');
  }
  get orWhereNotIn() {
    return bind(this.queryBuilder(), 'orWhereNotIn');
  }
  get whereNull() {
    return bind(this.queryBuilder(), 'whereNull');
  }
  get orWhereNull() {
    return bind(this.queryBuilder(), 'orWhereNull');
  }
  get whereNotNull() {
    return bind(this.queryBuilder(), 'whereNotNull');
  }
  get orWhereNotNull() {
    return bind(this.queryBuilder(), 'orWhereNotNull');
  }
  get whereBetween() {
    return bind(this.queryBuilder(), 'whereBetween');
  }
  get whereNotBetween() {
    return bind(this.queryBuilder(), 'whereNotBetween');
  }
  get andWhereBetween() {
    return bind(this.queryBuilder(), 'andWhereBetween');
  }
  get andWhereNotBetween() {
    return bind(this.queryBuilder(), 'andWhereNotBetween');
  }
  get orWhereBetween() {
    return bind(this.queryBuilder(), 'orWhereBetween');
  }
  get orWhereNotBetween() {
    return bind(this.queryBuilder(), 'orWhereNotBetween');
  }
  get groupBy() {
    return bind(this.queryBuilder(), 'groupBy');
  }
  get groupByRaw() {
    return bind(this.queryBuilder(), 'groupByRaw');
  }
  get orderBy() {
    return bind(this.queryBuilder(), 'orderBy');
  }
  get orderByRaw() {
    return bind(this.queryBuilder(), 'orderByRaw');
  }
  get union() {
    return bind(this.queryBuilder(), 'union');
  }
  get unionAll() {
    return bind(this.queryBuilder(), 'unionAll');
  }
  get intersect() {
    return bind(this.queryBuilder(), 'intersect');
  }
  get having() {
    return bind(this.queryBuilder(), 'having');
  }
  get havingRaw() {
    return bind(this.queryBuilder(), 'havingRaw');
  }
  get orHaving() {
    return bind(this.queryBuilder(), 'orHaving');
  }
  get orHavingRaw() {
    return bind(this.queryBuilder(), 'orHavingRaw');
  }
  get offset() {
    return bind(this.queryBuilder(), 'offset');
  }
  get limit() {
    return bind(this.queryBuilder(), 'limit');
  }
  get count() {
    return bind(this.queryBuilder(), 'count');
  }
  get countDistinct() {
    return bind(this.queryBuilder(), 'countDistinct');
  }
  get min() {
    return bind(this.queryBuilder(), 'min');
  }
  get max() {
    return bind(this.queryBuilder(), 'max');
  }
  get sum() {
    return bind(this.queryBuilder(), 'sum');
  }
  get sumDistinct() {
    return bind(this.queryBuilder(), 'sumDistinct');
  }
  get avg() {
    return bind(this.queryBuilder(), 'avg');
  }
  get avgDistinct() {
    return bind(this.queryBuilder(), 'avgDistinct');
  }
  get increment() {
    return bind(this.queryBuilder(), 'increment');
  }
  get decrement() {
    return bind(this.queryBuilder(), 'decrement');
  }
  get first() {
    return bind(this.queryBuilder(), 'first');
  }
  get debug() {
    return bind(this.queryBuilder(), 'debug');
  }
  get pluck() {
    return bind(this.queryBuilder(), 'pluck');
  }
  get clearSelect() {
    return bind(this.queryBuilder(), 'clearSelect');
  }
  get clearWhere() {
    return bind(this.queryBuilder(), 'clearWhere');
  }
  get clearGroup() {
    return bind(this.queryBuilder(), 'clearGroup');
  }
  get clearOrder() {
    return bind(this.queryBuilder(), 'clearOrder');
  }
  get clearHaving() {
    return bind(this.queryBuilder(), 'clearHaving');
  }
  get insert() {
    return bind(this.queryBuilder(), 'insert');
  }
  get update() {
    return bind(this.queryBuilder(), 'update');
  }
  get returning() {
    return bind(this.queryBuilder(), 'returning');
  }
  get del() {
    return bind(this.queryBuilder(), 'del');
  }
  get delete() {
    return bind(this.queryBuilder(), 'delete');
  }
  get truncate() {
    return bind(this.queryBuilder(), 'truncate');
  }
  get transacting() {
    return bind(this.queryBuilder(), 'transacting');
  }
  get connection() {
    return bind(this.queryBuilder(), 'connection');
  }
  // JSON methods
  // Json manipulation functions
  get jsonExtract() {
    return bind(this.queryBuilder(), 'jsonExtract');
  }
  get jsonSet() {
    return bind(this.queryBuilder(), 'jsonSet');
  }
  get jsonInsert() {
    return bind(this.queryBuilder(), 'jsonInsert');
  }
  get jsonRemove() {
    return bind(this.queryBuilder(), 'jsonRemove');
  }
  // Wheres Json
  get whereJsonObject() {
    return bind(this.queryBuilder(), 'whereJsonObject');
  }
  get orWhereJsonObject() {
    return bind(this.queryBuilder(), 'orWhereJsonObject');
  }
  get andWhereJsonObject() {
    return bind(this.queryBuilder(), 'andWhereJsonObject');
  }
  get whereNotJsonObject() {
    return bind(this.queryBuilder(), 'whereNotJsonObject');
  }
  get orWhereNotJsonObject() {
    return bind(this.queryBuilder(), 'orWhereNotJsonObject');
  }
  get andWhereNotJsonObject() {
    return bind(this.queryBuilder(), 'andWhereNotJsonObject');
  }
  get whereJsonPath() {
    return bind(this.queryBuilder(), 'whereJsonPath');
  }
  get orWhereJsonPath() {
    return bind(this.queryBuilder(), 'orWhereJsonPath');
  }
  get andWhereJsonPath() {
    return bind(this.queryBuilder(), 'andWhereJsonPath');
  }
  get whereJsonSupersetOf() {
    return bind(this.queryBuilder(), 'whereJsonSupersetOf');
  }
  get orWhereJsonSupersetOf() {
    return bind(this.queryBuilder(), 'orWhereJsonSupersetOf');
  }
  get andWhereJsonSupersetOf() {
    return bind(this.queryBuilder(), 'andWhereJsonSupersetOf');
  }
  get whereJsonNotSupersetOf() {
    return bind(this.queryBuilder(), 'whereJsonNotSupersetOf');
  }
  get orWhereJsonNotSupersetOf() {
    return bind(this.queryBuilder(), 'orWhereJsonNotSupersetOf');
  }
  get andWhereJsonNotSupersetOf() {
    return bind(this.queryBuilder(), 'andWhereJsonNotSupersetOf');
  }
  get whereJsonSubsetOf() {
    return bind(this.queryBuilder(), 'whereJsonSubsetOf');
  }
  get orWhereJsonSubsetOf() {
    return bind(this.queryBuilder(), 'orWhereJsonSubsetOf');
  }
  get andWhereJsonSubsetOf() {
    return bind(this.queryBuilder(), 'andWhereJsonSubsetOf');
  }
  get whereJsonNotSubsetOf() {
    return bind(this.queryBuilder(), 'whereJsonNotSubsetOf');
  }
  get orWhereJsonNotSubsetOf() {
    return bind(this.queryBuilder(), 'orWhereJsonNotSubsetOf');
  }
  get andWhereJsonNotSubsetOf() {
    return bind(this.queryBuilder(), 'andWhereJsonNotSubsetOf');
  }
  //#endregion query builder forwards

  //#region event emitter
  private internalListeners: {
    eventName: string;
    listener: (...args: any[]) => void;
  }[] = [];

  private addInternalListener(
    eventName: string,
    listener: (...args: any[]) => void
  ) {
    this.client.on(eventName, listener);
    this.internalListeners.push({ eventName, listener });
  }

  private copyEventListeners(eventName: string, target: EventEmitter) {
    const listeners = this.listeners(eventName);
    listeners.forEach((listener) => {
      target.on(eventName, listener as (...args: any[]) => void);
    });
  }
  //#endregion event emitter

  withUserParams(params): this {
    let client: Client;
    // TODO: Why should client be allowed to be undefined?
    if (this.client) {
      client = Object.create(this.client.constructor.prototype); // Clone client to avoid leaking listeners that are set on it
      merge(client, this.client);
      client.config = { ...this.client.config }; // Clone client config to make sure they can be modified independently
    }
    const contextCtor = this.context.constructor as new (
      client: Client
    ) => KnexContext;
    const context = new contextCtor(client);
    const facadeCtor = this.constructor as new (context: KnexContext) => this;
    const facade = new facadeCtor(context);

    this.copyEventListeners('query', facade);
    this.copyEventListeners('query-error', facade);
    this.copyEventListeners('query-response', facade);
    this.copyEventListeners('start', facade);
    facade.userParams = params;
    return facade;
  }
}

export default function makeFacade(client: Client) {
  // TODO: Why do we need two layers?
  const context = new KnexContext(client);
  const facade = new KnexFacade(context) as KnexFacade & {
    (tableName: string, options: any): Builder;
  };
  return facade;
}
