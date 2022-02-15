import { DEFAULT_EXT, DEFAULT_TABLE_NAME } from './constants';
const { resolveClientNameWithAliases } = require('../../lib/util/helpers');
import fs from 'fs';
import path from 'path';
import escalade from 'escalade/sync';
import tildify from 'tildify';
import color from 'colorette';
import getopts from 'getopts';

const argv = getopts(process.argv.slice(2));

export function mkConfigObj(opts) {
  if (!opts.client) {
    throw new Error(
      `No configuration file found and no commandline connection parameters passed`
    );
  }

  const envName = opts.env || process.env.NODE_ENV || 'development';
  const resolvedClientName = resolveClientNameWithAliases(opts.client);
  const useNullAsDefault = resolvedClientName === 'sqlite3';
  return {
    ext: DEFAULT_EXT,
    [envName]: {
      useNullAsDefault,
      client: opts.client,
      connection: opts.connection,
      migrations: {
        directory: opts.migrationsDirectory,
        tableName: opts.migrationsTableName || DEFAULT_TABLE_NAME,
      },
    },
  };
}

export function resolveEnvironmentConfig(opts, allConfigs, configFilePath) {
  const environment = opts.env || process.env.NODE_ENV || 'development';
  const result = allConfigs[environment] || allConfigs;

  if (allConfigs[environment]) {
    console.log('Using environment:', color.magenta(environment));
  }

  if (!result) {
    console.log(color.red('Warning: unable to read knexfile config'));
    process.exit(1);
  }

  if (argv.debug !== undefined) {
    result.debug = argv.debug;
  }

  // It is safe to assume that unless explicitly specified, we would want
  // migrations, seeds etc. to be generated with same extension
  if (configFilePath) {
    result.ext = result.ext || path.extname(configFilePath).replace('.', '');
  }

  return result;
}

export function exit(text) {
  if (text instanceof Error) {
    if (text.message) {
      console.error(color.red(text.message));
    }
    console.error(
      color.red(`${text.detail ? `${text.detail}\n` : ''}${text.stack}`)
    );
  } else {
    console.error(color.red(text));
  }
  process.exit(1);
}

export function success(text) {
  console.log(text);
  process.exit(0);
}

export function checkLocalModule(env) {
  if (!env.modulePath) {
    console.log(
      color.red('No local knex install found in:'),
      color.magenta(tildify(env.cwd))
    );
    exit('Try running: npm install knex');
  }
}

export function getMigrationExtension(env, opts) {
  const config = resolveEnvironmentConfig(
    opts,
    env.configuration,
    env.configPath
  );

  let ext = DEFAULT_EXT;
  if (argv.x) {
    ext = argv.x;
  } else if (config.migrations && config.migrations.extension) {
    ext = config.migrations.extension;
  } else if (config.ext) {
    ext = config.ext;
  }
  return ext.toLowerCase();
}

export function getSeedExtension(env, opts) {
  const config = resolveEnvironmentConfig(
    opts,
    env.configuration,
    env.configPath
  );

  let ext = DEFAULT_EXT;
  if (argv.x) {
    ext = argv.x;
  } else if (config.seeds && config.seeds.extension) {
    ext = config.seeds.extension;
  } else if (config.ext) {
    ext = config.ext;
  }
  return ext.toLowerCase();
}

export function getStubPath(configKey, env, opts) {
  const config = resolveEnvironmentConfig(opts, env.configuration);
  const stubDirectory = config[configKey] && config[configKey].directory;

  const { stub } = argv;
  if (!stub) {
    return null;
  } else if (stub.includes('/')) {
    // relative path to stub
    return stub;
  }

  // using stub <name> must have config[configKey].directory defined
  if (!stubDirectory) {
    console.log(color.red('Failed to load stub'), color.magenta(stub));
    exit(`config.${configKey}.directory in knexfile must be defined`);
  }

  return path.join(stubDirectory, stub);
}

export function findUpModulePath(cwd, packageName) {
  const modulePackagePath = escalade(cwd, (dir, names) => {
    if (names.includes('package.json')) {
      return 'package.json';
    }
    return false;
  });
  try {
    const modulePackage = require(modulePackagePath);
    if (modulePackage.name === packageName) {
      return path.join(
        path.dirname(modulePackagePath),
        modulePackage.main || 'index.js'
      );
    }
  } catch (e) {}
}

export function findUpConfig(cwd, name, extensions) {
  return escalade(cwd, (dir, names) => {
    for (const ext of extensions) {
      const filename = `${name}.${ext}`;
      if (names.includes(filename)) {
        return filename;
      }
    }
    return false;
  });
}
