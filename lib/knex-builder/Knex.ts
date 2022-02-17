export { default as Client } from '../client';
export { KnexTimeoutError } from '../util/timeout';

import { Config } from '../client';
import { resolveConfig } from './internal/config-resolver';
import makeFacade from './make-knex';

export default function knex(config: Config | string) {
  const { resolvedConfig, Dialect } = resolveConfig(config);

  const facade = makeFacade(new Dialect(resolvedConfig));
  if (resolvedConfig.userParams) {
    facade.userParams = resolvedConfig.userParams;
  }
  return facade;
}
