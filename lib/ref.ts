import Client from './client';
import Raw from './raw';

export default class Ref extends Raw {
  ref: string;
  private _schema: string | null;
  private _alias: string | null;

  constructor(client: Client, ref: string) {
    super(client);

    this.ref = ref;
    this._schema = null;
    this._alias = null;
  }

  withSchema(schema: string) {
    this._schema = schema;

    return this;
  }

  as(alias: string) {
    this._alias = alias;

    return this;
  }

  toSQL(method, tz) {
    const string = this._schema ? `${this._schema}.${this.ref}` : this.ref;

    const formatter = this.client.formatter(this);

    const ref = formatter.columnize(string);

    const sql = this._alias ? `${ref} as ${formatter.wrap(this._alias)}` : ref;

    this.set(sql, []);

    return super.toSQL(method, tz);
  }
}
