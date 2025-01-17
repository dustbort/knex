import Client, { Config } from '../../client';
import { SUPPORTED_CLIENTS } from '../../constants';

import parseConnection from './parse-connection';
import { resolveClientNameWithAliases } from '../../util/helpers';

/*
ERRATUM: `config`: function not accepted

The connection options are passed directly to the appropriate database client to create the connection, and may be either an object, a connection string, or a `function` returning an object:
*/

export function resolveConfig(config: Config | string, _arg1?: unknown, _arg2?: Config) {
  let Dialect: { new(...args: ConstructorParameters<typeof Client>): Client };
  let resolvedConfig;

  // If config is a string, try to parse it
  const parsedConfig =
    typeof config === 'string'
      ? Object.assign(parseConnection(config), _arg2)
      : config;

  // If user provided no relevant parameters, use generic client
  if (
    arguments.length === 0 ||
    (!parsedConfig.client && !parsedConfig.dialect)
  ) {
    Dialect = Client;
  }
  // If user provided Client constructor as a parameter, use it
  else if (typeof parsedConfig.client === 'function') {
    Dialect = parsedConfig.client;
  }
  // If neither applies, let's assume user specified name of a client or dialect as a string
  else {
    const clientName = parsedConfig.client ?? parsedConfig.dialect;
    if (!clientName || !SUPPORTED_CLIENTS.includes(clientName)) {
      throw new Error(
        `knex: Unknown configuration option 'client' value ${clientName}. Note that it is case-sensitive, check documentation for supported values.`
      );
    }

    const resolvedClientName = resolveClientNameWithAliases(clientName);
    Dialect = require(`../../dialects/${resolvedClientName}/index.js`);
  }

  // If config connection parameter is passed as string, try to parse it
  if (typeof parsedConfig.connection === 'string') {
    resolvedConfig = Object.assign({}, parsedConfig, {
      connection: parseConnection(parsedConfig.connection).connection,
    });
  } else {
    resolvedConfig = Object.assign({}, parsedConfig);
  }

  return {
    resolvedConfig,
    Dialect,
  };
}

