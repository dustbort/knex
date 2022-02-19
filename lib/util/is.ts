export function isString(value: any): value is string {
  return typeof value === 'string';
}

export function isNumber(value: any): value is number {
  return typeof value === 'number';
}

export function isBoolean(value: any): value is boolean {
  return typeof value === 'boolean';
}

export function isUndefined(value: any): value is undefined {
  return typeof value === 'undefined';
}

export function isObject(value: any): value is Object {
  // TODO: maybe also not array
  return typeof value === 'object' && value !== null;
}

export function isFunction(value: any): value is Function {
  return typeof value === 'function';
}
