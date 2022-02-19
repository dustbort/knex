import EventEmitter from "events";

export interface Builder extends EventEmitter {
  _connection: unknown;
  _events: unknown;
  sql: string;
  bindings: unknown;
  queryContext(context?: string): any;
}

export interface Connection {
  __knexUid: string;
  __knexTxId: string;
}