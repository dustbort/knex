// Raw
// -------
import { EventEmitter } from 'events';
import debug from 'debug';
import assign from 'lodash/assign';
import isPlainObject from 'lodash/isPlainObject';
import reduce from 'lodash/reduce';

import {
  replaceRawArrBindings,
  replaceKeyBindings,
} from './formatter/rawFormatter';
import * as helpers from './util/helpers';
import saveAsyncStack from './util/save-async-stack';
import { nanoid } from './util/nanoid';
import { isNumber, isObject } from './util/is';
import {
  augmentWithBuilderInterface,
} from './builder-interface-augmenter';
import Client from './client';
import { BindingHolder } from './formatter';

const debugBindings = debug('knex:bindings');

export default class Raw extends EventEmitter {
  client: Client;
  sql: string;
  bindings: BindingHolder['bindings'];
  private _wrappedBefore: unknown;
  private _wrappedAfter: unknown;
  private _debug?: boolean;
  private _timeout?: number;
  private _cancelOnTimeout?: boolean;
  private _before?: unknown;
  private _after?: unknown;
  private _options?: unknown;

  constructor(client: Client) {
    super();

    this.client = client;
    this.sql = '';
    this.bindings = [];

    // Todo: Deprecate
    this._wrappedBefore = undefined;
    this._wrappedAfter = undefined;
    if (client?.config) {
      this._debug = client.config.debug;
      saveAsyncStack(this, 4);
    }
  }

  set(sql: string, bindings: any) {
    this.sql = sql;
    this.bindings =
      (isObject(bindings) && !bindings.toSQL) || bindings === undefined
        ? bindings
        : [bindings];

    return this;
  }

  timeout(ms: number, { cancel = undefined } = {}) {
    if (isNumber(ms) && ms > 0) {
      this._timeout = ms;
      if (cancel) {
        this.client.assertCanCancelQuery();
        this._cancelOnTimeout = true;
      }
    }
    return this;
  }

  // Wraps the current sql with `before` and `after`.
  wrap(before, after) {
    this._wrappedBefore = before;
    this._wrappedAfter = after;
    return this;
  }

  // Calls `toString` on the Knex object.
  toString() {
    return this.toQuery();
  }

  // Returns the raw sql for the query.
  toSQL(method, tz) {
    let obj;
    if (Array.isArray(this.bindings)) {
      obj = replaceRawArrBindings(this, this.client);
    } else if (this.bindings && isPlainObject(this.bindings)) {
      obj = replaceKeyBindings(this, this.client);
    } else {
      obj = {
        method: 'raw',
        sql: this.sql,
        bindings: this.bindings === undefined ? [] : [this.bindings],
      };
    }

    if (this._wrappedBefore) {
      obj.sql = this._wrappedBefore + obj.sql;
    }
    if (this._wrappedAfter) {
      obj.sql = obj.sql + this._wrappedAfter;
    }

    obj.options = reduce(this._options, assign, {});

    if (this._timeout) {
      obj.timeout = this._timeout;
      if (this._cancelOnTimeout) {
        obj.cancelOnTimeout = this._cancelOnTimeout;
      }
    }

    obj.bindings = obj.bindings || [];
    if (helpers.containsUndefined(obj.bindings)) {
      const undefinedBindingIndices = helpers.getUndefinedIndices(
        this.bindings
      );
      debugBindings(obj.bindings);
      throw new Error(
        `Undefined binding(s) detected for keys [${undefinedBindingIndices}] when compiling RAW query: ${obj.sql}`
      );
    }

    obj.__knexQueryUid = nanoid();

    Object.defineProperties(obj, {
      toNative: {
        value: () => ({
          sql: this.client.positionBindings(obj.sql),
          bindings: this.client.prepBindings(obj.bindings),
        }),
        enumerable: false,
      },
    });

    return obj;
  }
}

const isRaw = (obj: any): obj is Raw => obj instanceof Raw;

// Allow the `Raw` object to be utilized with full access to the relevant
// promise API.
augmentWithBuilderInterface(Raw);
helpers.addQueryContext(Raw);
