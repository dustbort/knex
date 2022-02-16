import isPlainObject from 'lodash/isPlainObject';
import isTypedArray from 'lodash/isTypedArray';
import { CLIENT_ALIASES } from '../constants';
import { isFunction } from './is';

// Check if the first argument is an array, otherwise uses all arguments as an
// array.
export function normalizeArr(...args: any[]) {
  if (Array.isArray(args[0])) {
    return args[0];
  }

  return args;
}

export function containsUndefined(mixed) {
  let argContainsUndefined = false;

  if (isTypedArray(mixed)) return false;

  if (mixed && isFunction(mixed.toSQL)) {
    //Any QueryBuilder or Raw will automatically be validated during compile.
    return argContainsUndefined;
  }

  if (Array.isArray(mixed)) {
    for (let i = 0; i < mixed.length; i++) {
      if (argContainsUndefined) break;
      argContainsUndefined = containsUndefined(mixed[i]);
    }
  } else if (isPlainObject(mixed)) {
    Object.keys(mixed).forEach((key) => {
      if (!argContainsUndefined) {
        argContainsUndefined = containsUndefined(mixed[key]);
      }
    });
  } else {
    argContainsUndefined = mixed === undefined;
  }

  return argContainsUndefined;
}

export function getUndefinedIndices(mixed) {
  const indices = [];

  if (Array.isArray(mixed)) {
    mixed.forEach((item, index) => {
      if (containsUndefined(item)) {
        indices.push(index);
      }
    });
  } else if (isPlainObject(mixed)) {
    Object.keys(mixed).forEach((key) => {
      if (containsUndefined(mixed[key])) {
        indices.push(key);
      }
    });
  } else {
    indices.push(0);
  }

  return indices;
}

export function addQueryContext(Target) {
  // Stores or returns (if called with no arguments) context passed to
  // wrapIdentifier and postProcessResponse hooks
  Target.prototype.queryContext = function (context) {
    if (context === undefined) {
      return this._queryContext;
    }
    this._queryContext = context;
    return this;
  };
}

export function resolveClientNameWithAliases(clientName: string) {
  return CLIENT_ALIASES[clientName] ?? clientName;
}

export function toNumber(val: any, fallback: number) {
  if (val === undefined || val === null) return fallback;
  const number = parseInt(val, 10);
  return isNaN(number) ? fallback : number;
}
