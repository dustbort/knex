export { default as Client } from '../client';
export { KnexTimeoutError } from '../util/timeout';

import { Config } from '../client';
import { resolveConfig } from './internal/config-resolver';
import makeFacade, { Callable, FacadeExtension } from './make-knex';

export function knex(
  config: Config | string
): FacadeExtension & Callable;
export function knex<E extends Record<string, Function>>(
  Config: Config | string,
  extensions: E
): FacadeExtension<E> & Callable<E>;
export default function knex(
  config: Config | string,
  extensions: Record<string, Function> = {}
) {
  const { resolvedConfig, Dialect } = resolveConfig(config);

  const facade = makeFacade(new Dialect(resolvedConfig), extensions);
  if (resolvedConfig.userParams) {
    facade.userParams = resolvedConfig.userParams;
  }
  return facade;
}
