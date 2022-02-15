import ColumnCompiler_Oracle from '../../oracle/schema/oracle-columncompiler';
import { isObject } from '../../../util/is';

export default class ColumnCompiler_Oracledb extends ColumnCompiler_Oracle {
  constructor() {
    super(...arguments);
    this.modifiers = ['defaultTo', 'nullable', 'comment'];
    this._addCheckModifiers();
  }

  datetime(withoutTz) {
    let useTz;
    if (isObject(withoutTz)) {
      ({ useTz } = withoutTz);
    } else {
      useTz = !withoutTz;
    }
    return useTz ? 'timestamp with local time zone' : 'timestamp';
  }

  timestamp(withoutTz) {
    let useTz;
    if (isObject(withoutTz)) {
      ({ useTz } = withoutTz);
    } else {
      useTz = !withoutTz;
    }
    return useTz ? 'timestamp with local time zone' : 'timestamp';
  }

  checkRegex(regex, constraintName) {
    return this._check(
      `REGEXP_LIKE(${this.formatter.wrap(
        this.getColumnName()
      )},${this.client._escapeBinding(regex)})`,
      constraintName
    );
  }

  json() {
    return `varchar2(4000) check (${this.formatter.columnize(
      this.getColumnName()
    )} is json)`;
  }

  jsonb() {
    return this.json();
  }
}

ColumnCompiler_Oracledb.prototype.time = 'timestamp with local time zone';
ColumnCompiler_Oracledb.prototype.uuid = ({ useBinaryUuid = false } = {}) =>
  useBinaryUuid ? 'raw(16)' : 'char(36)';
