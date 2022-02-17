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

type NotFunction<T> = {
  [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];
type OmitNotFunction<T> = Omit<T, NotFunction<T>>;

type FacadeExtension<E> = KnexFacade<E> & E;
type BuilderExtension<E> = Builder<E> & E;

export default function makeFacade(client: Client) {
  // TODO: Why do we need two layers?
  const context = new KnexContext(client);
  const facade = new KnexFacade(context) as KnexFacade & {
    (tableName: string, options: any): Builder;
  };
  return facade;
}

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

class KnexFacade<E = void> extends EventEmitter {
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
  ): FacadeExtension<OmitNotFunction<E & { [K in M]: (...args: T) => U }>>;
  extend<M extends { [x: string]: Function | undefined }>(
    methods: M
  ): FacadeExtension<OmitNotFunction<E & M>>;
  extend(
    method: string | { [x: string]: Function | undefined },
    fn?: Function
  ): any {
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
  queryBuilder(): BuilderExtension<E> {
    const proxy: any = new Proxy(this.context.queryBuilder(), {
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
    return this.context.raw.bind(this.context);
  }
  get batchInsert() {
    return this.context.batchInsert.bind(this.context);
  }
  get transaction() {
    return this.context.transaction.bind(this.context);
  }
  get transactionProvider() {
    return this.context.transactionProvider.bind(this.context);
  }
  get initialize() {
    return this.context.initialize.bind(this.context);
  }
  get destroy() {
    return this.context.destroy.bind(this.context);
  }
  get ref() {
    return this.context.ref.bind(this.context);
  }
  get disableProcessing() {
    return this.context.disableProcessing.bind(this.context);
  }
  get enableProcessing() {
    return this.context.enableProcessing.bind(this.context);
  }
  //#endregion context fowards

  //#region query builder forwards
  get with() {
    const qb = this.queryBuilder();
    return qb.with.bind(qb);
  }
  get withRecursive() {
    const qb = this.queryBuilder();
    return qb.withRecursive.bind(qb);
  }
  get withMaterialized() {
    const qb = this.queryBuilder();
    return qb.withMaterialized.bind(qb);
  }
  get withNotMaterialized() {
    const qb = this.queryBuilder();
    return qb.withNotMaterialized.bind(qb);
  }
  get select() {
    const qb = this.queryBuilder();
    return qb.select.bind(qb);
  }
  get as() {
    const qb = this.queryBuilder();
    return qb.as.bind(qb);
  }
  get columns() {
    const qb = this.queryBuilder();
    return qb.columns.bind(qb);
  }
  get column() {
    const qb = this.queryBuilder();
    return qb.column.bind(qb);
  }
  get from() {
    const qb = this.queryBuilder();
    return qb.from.bind(qb);
  }
  get fromJS() {
    const qb = this.queryBuilder();
    return qb.fromJS.bind(qb);
  }
  get fromRaw() {
    const qb = this.queryBuilder();
    return qb.fromRaw.bind(qb);
  }
  get into() {
    const qb = this.queryBuilder();
    return qb.into.bind(qb);
  }
  get withSchema() {
    const qb = this.queryBuilder();
    return qb.withSchema.bind(qb);
  }
  get table() {
    const qb = this.queryBuilder();
    return qb.table.bind(qb);
  }
  get distinct() {
    const qb = this.queryBuilder();
    return qb.distinct.bind(qb);
  }
  get join() {
    const qb = this.queryBuilder();
    return qb.join.bind(qb);
  }
  get joinRaw() {
    const qb = this.queryBuilder();
    return qb.joinRaw.bind(qb);
  }
  get innerJoin() {
    const qb = this.queryBuilder();
    return qb.innerJoin.bind(qb);
  }
  get leftJoin() {
    const qb = this.queryBuilder();
    return qb.leftJoin.bind(qb);
  }
  get leftOuterJoin() {
    const qb = this.queryBuilder();
    return qb.leftOuterJoin.bind(qb);
  }
  get rightJoin() {
    const qb = this.queryBuilder();
    return qb.rightJoin.bind(qb);
  }
  get rightOuterJoin() {
    const qb = this.queryBuilder();
    return qb.rightOuterJoin.bind(qb);
  }
  get outerJoin() {
    const qb = this.queryBuilder();
    return qb.outerJoin.bind(qb);
  }
  get fullOuterJoin() {
    const qb = this.queryBuilder();
    return qb.fullOuterJoin.bind(qb);
  }
  get crossJoin() {
    const qb = this.queryBuilder();
    return qb.crossJoin.bind(qb);
  }
  get where() {
    const qb = this.queryBuilder();
    return qb.where.bind(qb);
  }
  get whereLike() {
    const qb = this.queryBuilder();
    return qb.whereLike.bind(qb);
  }
  get whereILike() {
    const qb = this.queryBuilder();
    return qb.whereILike.bind(qb);
  }
  get andWhere() {
    const qb = this.queryBuilder();
    return qb.andWhere.bind(qb);
  }
  get orWhere() {
    const qb = this.queryBuilder();
    return qb.orWhere.bind(qb);
  }
  get whereNot() {
    const qb = this.queryBuilder();
    return qb.whereNot.bind(qb);
  }
  get orWhereNot() {
    const qb = this.queryBuilder();
    return qb.orWhereNot.bind(qb);
  }
  get whereRaw() {
    const qb = this.queryBuilder();
    return qb.whereRaw.bind(qb);
  }
  get whereWrapped() {
    const qb = this.queryBuilder();
    return qb.whereWrapped.bind(qb);
  }
  get havingWrapped() {
    const qb = this.queryBuilder();
    return qb.havingWrapped.bind(qb);
  }
  get orWhereRaw() {
    const qb = this.queryBuilder();
    return qb.orWhereRaw.bind(qb);
  }
  get whereExists() {
    const qb = this.queryBuilder();
    return qb.whereExists.bind(qb);
  }
  get orWhereExists() {
    const qb = this.queryBuilder();
    return qb.orWhereExists.bind(qb);
  }
  get whereNotExists() {
    const qb = this.queryBuilder();
    return qb.whereNotExists.bind(qb);
  }
  get orWhereNotExists() {
    const qb = this.queryBuilder();
    return qb.orWhereNotExists.bind(qb);
  }
  get whereIn() {
    const qb = this.queryBuilder();
    return qb.whereIn.bind(qb);
  }
  get orWhereIn() {
    const qb = this.queryBuilder();
    return qb.orWhereIn.bind(qb);
  }
  get whereNotIn() {
    const qb = this.queryBuilder();
    return qb.whereNotIn.bind(qb);
  }
  get orWhereNotIn() {
    const qb = this.queryBuilder();
    return qb.orWhereNotIn.bind(qb);
  }
  get whereNull() {
    const qb = this.queryBuilder();
    return qb.whereNull.bind(qb);
  }
  get orWhereNull() {
    const qb = this.queryBuilder();
    return qb.orWhereNull.bind(qb);
  }
  get whereNotNull() {
    const qb = this.queryBuilder();
    return qb.whereNotNull.bind(qb);
  }
  get orWhereNotNull() {
    const qb = this.queryBuilder();
    return qb.orWhereNotNull.bind(qb);
  }
  get whereBetween() {
    const qb = this.queryBuilder();
    return qb.whereBetween.bind(qb);
  }
  get whereNotBetween() {
    const qb = this.queryBuilder();
    return qb.whereNotBetween.bind(qb);
  }
  get andWhereBetween() {
    const qb = this.queryBuilder();
    return qb.andWhereBetween.bind(qb);
  }
  get andWhereNotBetween() {
    const qb = this.queryBuilder();
    return qb.andWhereNotBetween.bind(qb);
  }
  get orWhereBetween() {
    const qb = this.queryBuilder();
    return qb.orWhereBetween.bind(qb);
  }
  get orWhereNotBetween() {
    const qb = this.queryBuilder();
    return qb.orWhereNotBetween.bind(qb);
  }
  get groupBy() {
    const qb = this.queryBuilder();
    return qb.groupBy.bind(qb);
  }
  get groupByRaw() {
    const qb = this.queryBuilder();
    return qb.groupByRaw.bind(qb);
  }
  get orderBy() {
    const qb = this.queryBuilder();
    return qb.orderBy.bind(qb);
  }
  get orderByRaw() {
    const qb = this.queryBuilder();
    return qb.orderByRaw.bind(qb);
  }
  get union() {
    const qb = this.queryBuilder();
    return qb.union.bind(qb);
  }
  get unionAll() {
    const qb = this.queryBuilder();
    return qb.unionAll.bind(qb);
  }
  get intersect() {
    const qb = this.queryBuilder();
    return qb.intersect.bind(qb);
  }
  get having() {
    const qb = this.queryBuilder();
    return qb.having.bind(qb);
  }
  get havingRaw() {
    const qb = this.queryBuilder();
    return qb.havingRaw.bind(qb);
  }
  get orHaving() {
    const qb = this.queryBuilder();
    return qb.orHaving.bind(qb);
  }
  get orHavingRaw() {
    const qb = this.queryBuilder();
    return qb.orHavingRaw.bind(qb);
  }
  get offset() {
    const qb = this.queryBuilder();
    return qb.offset.bind(qb);
  }
  get limit() {
    const qb = this.queryBuilder();
    return qb.limit.bind(qb);
  }
  get count() {
    const qb = this.queryBuilder();
    return qb.count.bind(qb);
  }
  get countDistinct() {
    const qb = this.queryBuilder();
    return qb.countDistinct.bind(qb);
  }
  get min() {
    const qb = this.queryBuilder();
    return qb.min.bind(qb);
  }
  get max() {
    const qb = this.queryBuilder();
    return qb.max.bind(qb);
  }
  get sum() {
    const qb = this.queryBuilder();
    return qb.sum.bind(qb);
  }
  get sumDistinct() {
    const qb = this.queryBuilder();
    return qb.sumDistinct.bind(qb);
  }
  get avg() {
    const qb = this.queryBuilder();
    return qb.avg.bind(qb);
  }
  get avgDistinct() {
    const qb = this.queryBuilder();
    return qb.avgDistinct.bind(qb);
  }
  get increment() {
    const qb = this.queryBuilder();
    return qb.increment.bind(qb);
  }
  get decrement() {
    const qb = this.queryBuilder();
    return qb.decrement.bind(qb);
  }
  get first() {
    const qb = this.queryBuilder();
    return qb.first.bind(qb);
  }
  get debug() {
    const qb = this.queryBuilder();
    return qb.debug.bind(qb);
  }
  get pluck() {
    const qb = this.queryBuilder();
    return qb.pluck.bind(qb);
  }
  get clearSelect() {
    const qb = this.queryBuilder();
    return qb.clearSelect.bind(qb);
  }
  get clearWhere() {
    const qb = this.queryBuilder();
    return qb.clearWhere.bind(qb);
  }
  get clearGroup() {
    const qb = this.queryBuilder();
    return qb.clearGroup.bind(qb);
  }
  get clearOrder() {
    const qb = this.queryBuilder();
    return qb.clearOrder.bind(qb);
  }
  get clearHaving() {
    const qb = this.queryBuilder();
    return qb.clearHaving.bind(qb);
  }
  get insert() {
    const qb = this.queryBuilder();
    return qb.insert.bind(qb);
  }
  get update() {
    const qb = this.queryBuilder();
    return qb.update.bind(qb);
  }
  get returning() {
    const qb = this.queryBuilder();
    return qb.returning.bind(qb);
  }
  get del() {
    const qb = this.queryBuilder();
    return qb.del.bind(qb);
  }
  get delete() {
    const qb = this.queryBuilder();
    return qb.delete.bind(qb);
  }
  get truncate() {
    const qb = this.queryBuilder();
    return qb.truncate.bind(qb);
  }
  get transacting() {
    const qb = this.queryBuilder();
    return qb.transacting.bind(qb);
  }
  get connection() {
    const qb = this.queryBuilder();
    return qb.connection.bind(qb);
  }
  // JSON methods
  // Json manipulation functions
  get jsonExtract() {
    const qb = this.queryBuilder();
    return qb.jsonExtract.bind(qb);
  }
  get jsonSet() {
    const qb = this.queryBuilder();
    return qb.jsonSet.bind(qb);
  }
  get jsonInsert() {
    const qb = this.queryBuilder();
    return qb.jsonInsert.bind(qb);
  }
  get jsonRemove() {
    const qb = this.queryBuilder();
    return qb.jsonRemove.bind(qb);
  }
  // Wheres Json
  get whereJsonObject() {
    const qb = this.queryBuilder();
    return qb.whereJsonObject.bind(qb);
  }
  get orWhereJsonObject() {
    const qb = this.queryBuilder();
    return qb.orWhereJsonObject.bind(qb);
  }
  get andWhereJsonObject() {
    const qb = this.queryBuilder();
    return qb.andWhereJsonObject.bind(qb);
  }
  get whereNotJsonObject() {
    const qb = this.queryBuilder();
    return qb.whereNotJsonObject.bind(qb);
  }
  get orWhereNotJsonObject() {
    const qb = this.queryBuilder();
    return qb.orWhereNotJsonObject.bind(qb);
  }
  get andWhereNotJsonObject() {
    const qb = this.queryBuilder();
    return qb.andWhereNotJsonObject.bind(qb);
  }
  get whereJsonPath() {
    const qb = this.queryBuilder();
    return qb.whereJsonPath.bind(qb);
  }
  get orWhereJsonPath() {
    const qb = this.queryBuilder();
    return qb.orWhereJsonPath.bind(qb);
  }
  get andWhereJsonPath() {
    const qb = this.queryBuilder();
    return qb.andWhereJsonPath.bind(qb);
  }
  get whereJsonSupersetOf() {
    const qb = this.queryBuilder();
    return qb.whereJsonSupersetOf.bind(qb);
  }
  get orWhereJsonSupersetOf() {
    const qb = this.queryBuilder();
    return qb.orWhereJsonSupersetOf.bind(qb);
  }
  get andWhereJsonSupersetOf() {
    const qb = this.queryBuilder();
    return qb.andWhereJsonSupersetOf.bind(qb);
  }
  get whereJsonNotSupersetOf() {
    const qb = this.queryBuilder();
    return qb.whereJsonNotSupersetOf.bind(qb);
  }
  get orWhereJsonNotSupersetOf() {
    const qb = this.queryBuilder();
    return qb.orWhereJsonNotSupersetOf.bind(qb);
  }
  get andWhereJsonNotSupersetOf() {
    const qb = this.queryBuilder();
    return qb.andWhereJsonNotSupersetOf.bind(qb);
  }
  get whereJsonSubsetOf() {
    const qb = this.queryBuilder();
    return qb.whereJsonSubsetOf.bind(qb);
  }
  get orWhereJsonSubsetOf() {
    const qb = this.queryBuilder();
    return qb.orWhereJsonSubsetOf.bind(qb);
  }
  get andWhereJsonSubsetOf() {
    const qb = this.queryBuilder();
    return qb.andWhereJsonSubsetOf.bind(qb);
  }
  get whereJsonNotSubsetOf() {
    const qb = this.queryBuilder();
    return qb.whereJsonNotSubsetOf.bind(qb);
  }
  get orWhereJsonNotSubsetOf() {
    const qb = this.queryBuilder();
    return qb.orWhereJsonNotSubsetOf.bind(qb);
  }
  get andWhereJsonNotSubsetOf() {
    const qb = this.queryBuilder();
    return qb.andWhereJsonNotSubsetOf.bind(qb);
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

    const facade = makeFacade(client);

    this.copyEventListeners('query', facade);
    this.copyEventListeners('query-error', facade);
    this.copyEventListeners('query-response', facade);
    this.copyEventListeners('start', facade);

    facade.extensions = { ...this.extensions }; 

    facade.userParams = params;

    return facade;
  }
}


