export function isString(value: any) {
  return typeof value === 'string';
}

export function isNumber(value: any) {
  return typeof value === 'number';
}

export function isBoolean(value: any) {
  return typeof value === 'boolean';
}

export function isUndefined(value: any) {
  return typeof value === 'undefined';
}

export function isObject(value: any) {
  // TODO: maybe also not array
  return typeof value === 'object' && value !== null;
}

export function isFunction(value: any) {
  return typeof value === 'function';
}
