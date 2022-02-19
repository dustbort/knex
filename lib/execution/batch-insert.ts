import chunk from 'lodash/chunk';
import flatten from 'lodash/flatten';
import delay from './internal/delay';
import { isNumber } from '../util/is';
import { KnexContext } from '../knex-builder/make-knex';
import Transaction from './transaction';

type Returning = string | string[];
type Transacting = Transaction | Promise<unknown>;

export default function batchInsert(
  client: KnexContext,
  tableName: string,
  batch: Record<string, any>[],
  chunkSize = 1000
) {
  let returning: Returning | undefined = undefined;
  let transaction: Transacting | undefined = undefined;
  if (!isNumber(chunkSize) || chunkSize < 1) {
    throw new TypeError(`Invalid chunkSize: ${chunkSize}`);
  }
  if (!Array.isArray(batch)) {
    throw new TypeError(`Invalid batch: Expected array, got ${typeof batch}`);
  }
  const chunks = chunk(batch, chunkSize);

  const runInTransaction = (cb: (tr: Transacting) => Transacting) => {
    if (transaction) {
      return cb(transaction);
    }
    return client.transaction(cb);
  };

  return Object.assign(
    Promise.resolve().then(async () => {
      //Next tick to ensure wrapper functions are called if needed
      await delay(1);
      return runInTransaction(async (tr) => {
        const chunksResults = [];
        for (const items of chunks) {
          chunksResults.push(await tr(tableName).insert(items, returning));
        }
        return flatten(chunksResults);
      });
    }),
    {
      returning(columns: Returning) {
        returning = columns;

        return this;
      },
      transacting(tr: Transacting) {
        transaction = tr;

        return this;
      },
    }
  );
}
