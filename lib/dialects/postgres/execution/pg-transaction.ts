import Transaction from '../../../execution/transaction';

export default class Transaction_PG extends Transaction {
  begin(conn) {
    if (this.isolationLevel) {
      return this.query(conn, `BEGIN ISOLATION LEVEL ${this.isolationLevel};`);
    }
    return this.query(conn, 'BEGIN;');
  }
}
