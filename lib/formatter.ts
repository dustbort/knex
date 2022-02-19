import {
  columnize as columnize_,
  wrap as wrap_,
} from './formatter/wrappingFormatter';
import type Client from './client';
import type QueryBuilder from './query/querybuilder';

export interface BindingHolder {
  bindings?: unknown[];
}

export default class Formatter implements BindingHolder {
  bindings?: unknown[];

  constructor(private client: Client, private builder: QueryBuilder) {
    this.bindings = [];
  }

  // Accepts a string or array of columns to wrap as appropriate.
  columnize(target: string | any[]) {
    return columnize_(target, this.builder, this.client, this);
  }

  // Puts the appropriate wrapper around a value depending on the database
  // engine, unless it's a knex.raw value, in which case it's left alone.
  wrap(value: any, isParameter?: boolean) {
    return wrap_(value, isParameter, this.builder, this.client, this);
  }
}
