export class KnexTimeoutError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'KnexTimeoutError';
  }
}

export function timeout<T>(promise: Promise<T>, ms: number) {
  return new Promise(function (resolve, reject) {
    const id = setTimeout(function () {
      reject(new KnexTimeoutError('operation timed out'));
    }, ms);

    function wrappedResolve(value: T) {
      clearTimeout(id);
      resolve(value);
    }

    function wrappedReject(err: any) {
      clearTimeout(id);
      reject(err);
    }

    promise.then(wrappedResolve, wrappedReject);
  });
}

