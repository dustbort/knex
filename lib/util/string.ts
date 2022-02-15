/*eslint max-len: 0, no-var:0 */

export const charsRegex = /[\0\b\t\n\r\x1a"'\\]/g; // eslint-disable-line no-control-regex
export const charsMap = {
  '\0': '\\0',
  '\b': '\\b',
  '\t': '\\t',
  '\n': '\\n',
  '\r': '\\r',
  '\x1a': '\\Z',
  '"': '\\"',
  "'": "\\'",
  '\\': '\\\\',
};

type FinalEscape = (val: any, ctx: any) => string;
type Escape = (val: any, finalEscape: FinalEscape, ctx: any) => string;

const wrapEscape = (escape: Escape): FinalEscape => {
  return function finalEscape(val, ctx = {}) {
    return escape(val, finalEscape, ctx);
  };
};

export interface Config {
  escapeDate?: typeof dateToString;
  escapeArray?: typeof arrayToList;
  escapeBuffer?: typeof bufferToString;
  escapeString?: typeof escapeString;
  escapeObject?: typeof escapeObject;
  wrap?: typeof wrapEscape;
}

export function makeEscape(config: Config = {}) {
  const finalEscapeDate = config.escapeDate ?? dateToString;
  const finalEscapeArray = config.escapeArray ?? arrayToList;
  const finalEscapeBuffer = config.escapeBuffer ?? bufferToString;
  const finalEscapeString = config.escapeString ?? escapeString;
  const finalEscapeObject = config.escapeObject ?? escapeObject;
  const finalWrap = config.wrap ?? wrapEscape;

  function escapeFn(val: any, finalEscape: FinalEscape, ctx: any) {
    if (val === undefined || val === null) {
      return 'NULL';
    }
    switch (typeof val) {
      case 'boolean':
        return val ? 'true' : 'false';
      case 'number':
        return val + '';
      case 'object':
        if (val instanceof Date) {
          val = finalEscapeDate(val, finalEscape, ctx);
        } else if (Array.isArray(val)) {
          return finalEscapeArray(val, finalEscape, ctx);
        } else if (Buffer.isBuffer(val)) {
          return finalEscapeBuffer(val, finalEscape, ctx);
        } else {
          return finalEscapeObject(val, finalEscape, ctx);
        }
    }
    return finalEscapeString(val, finalEscape, ctx);
  }

  return finalWrap ? finalWrap(escapeFn) : escapeFn;
}

export function escapeObject(
  val: any,
  finalEscape: (val: any, ctx: any) => string,
  ctx: any
) {
  if (val && typeof val.toSQL === 'function') {
    return val.toSQL(ctx);
  } else {
    return JSON.stringify(val);
  }
}

export const arrayToList = (
  array: any[],
  finalEscape: FinalEscape,
  ctx: any
): string =>
  array
    .map((val) =>
      Array.isArray(val)
        ? ['(', arrayToList(val, finalEscape, ctx), ')'].join('')
        : finalEscape(val, ctx)
    )
    .join(', ');

export function bufferToString(
  buffer: Buffer,
  finalEscape: FinalEscape,
  ctx: any
) {
  return 'X' + escapeString(buffer.toString('hex'), finalEscape, ctx);
}

export function escapeString(val: string, finalEscape: FinalEscape, ctx: any) {
  let chunkIndex = (charsRegex.lastIndex = 0);
  let escapedVal: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = charsRegex.exec(val))) {
    escapedVal.push(
      val.slice(chunkIndex, match.index) +
        charsMap[match[0] as keyof typeof charsMap]
    );
    chunkIndex = charsRegex.lastIndex;
  }

  if (chunkIndex === 0) {
    // Nothing was escaped
    return `'${val}`;
  }

  if (chunkIndex < val.length) {
    return `${escapedVal.join('')}${val.slice(chunkIndex)}`;
  }

  return `'${escapedVal.join('')}'`;
}

export function dateToString(date: Date, finalEscape: FinalEscape, ctx: any = {}) {
  const timeZone = ctx.timeZone || 'local';

  const dt = date;
  let year;
  let month;
  let day;
  let hour;
  let minute;
  let second;
  let millisecond;

  if (timeZone === 'local') {
    year = dt.getFullYear();
    month = dt.getMonth() + 1;
    day = dt.getDate();
    hour = dt.getHours();
    minute = dt.getMinutes();
    second = dt.getSeconds();
    millisecond = dt.getMilliseconds();
  } else {
    const tz = convertTimezone(timeZone);

    if (tz !== false && tz !== 0) {
      dt.setTime(dt.getTime() + tz * 60000);
    }

    year = dt.getUTCFullYear();
    month = dt.getUTCMonth() + 1;
    day = dt.getUTCDate();
    hour = dt.getUTCHours();
    minute = dt.getUTCMinutes();
    second = dt.getUTCSeconds();
    millisecond = dt.getUTCMilliseconds();
  }

  // YYYY-MM-DD HH:mm:ss.mmm
  return (
    zeroPad(year, 4) +
    '-' +
    zeroPad(month, 2) +
    '-' +
    zeroPad(day, 2) +
    ' ' +
    zeroPad(hour, 2) +
    ':' +
    zeroPad(minute, 2) +
    ':' +
    zeroPad(second, 2) +
    '.' +
    zeroPad(millisecond, 3)
  );
}

function zeroPad(number: number, length: number) {
  return number.toString().padStart(length, '0');
}

function convertTimezone(tz: string) {
  if (tz === 'Z') {
    return 0;
  }
  const m = tz.match(/([+\-\s])(\d\d):?(\d\d)?/);
  if (m) {
    return (
      (m[1] == '-' ? -1 : 1) *
      (parseInt(m[2], 10) + (m[3] ? parseInt(m[3], 10) : 0) / 60) *
      60
    );
  }
  return false;
}
