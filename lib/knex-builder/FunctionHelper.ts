// FunctionHelper
// -------
// Used for adding functions from the builder
// Example usage: table.dateTime('datetime_to_date').notNull().defaultTo(knex.fn.now());
export default class FunctionHelper {
  constructor(client) {
    this.client = client;
  }

  now(precision) {
    if (typeof precision === 'number') {
      return this.client.raw(`CURRENT_TIMESTAMP(${precision})`);
    }
    return this.client.raw('CURRENT_TIMESTAMP');
  }

  uuidToBin(uuid, ordered = true) {
    const buf = Buffer.from(uuid.replace(/-/g, ''), 'hex');
    return ordered
      ? Buffer.concat([
          buf.slice(6, 8),
          buf.slice(4, 6),
          buf.slice(0, 4),
          buf.slice(8, 16),
        ])
      : Buffer.concat([
          buf.slice(0, 4),
          buf.slice(4, 6),
          buf.slice(6, 8),
          buf.slice(8, 16),
        ]);
  }

  binToUuid(bin, ordered = true) {
    const buf = Buffer.from(bin, 'hex');
    return ordered
      ? [
          buf.toString('hex', 4, 8),
          buf.toString('hex', 2, 4),
          buf.toString('hex', 0, 2),
          buf.toString('hex', 8, 10),
          buf.toString('hex', 10, 16),
        ].join('-')
      : [
          buf.toString('hex', 0, 4),
          buf.toString('hex', 4, 6),
          buf.toString('hex', 6, 8),
          buf.toString('hex', 8, 10),
          buf.toString('hex', 10, 16),
        ].join('-');
  }
}
