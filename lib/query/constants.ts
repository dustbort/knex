/**
 * internal constants, do not use in application code
 */

export const lockMode = {
  forShare: 'forShare',
  forUpdate: 'forUpdate',
  forNoKeyUpdate: 'forNoKeyUpdate',
  forKeyShare: 'forKeyShare',
} as const;
export const waitMode = {
  skipLocked: 'skipLocked',
  noWait: 'noWait',
} as const;
